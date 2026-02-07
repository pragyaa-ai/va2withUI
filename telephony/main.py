"""
Waybeo Telephony WebSocket service (Gemini Live backend) - MVP.

Protocol assumption matches the working singleinterface telephony service:
Client sends JSON messages with:
- event: "start" | "media" | "stop"
- ucid: string (call/session id)
- data.samples: number[] (int16 PCM samples at 8kHz)

This service bridges telephony audio to Gemini Live:
- Waybeo 8kHz -> resample -> Gemini 16kHz PCM16 base64
- Gemini audio output (assumed 24kHz PCM16 base64) -> resample -> Waybeo 8kHz samples

Multi-agent support:
- Routes to different prompts based on ?agent=xxx query parameter
- Supported agents: spotlight (Kia), tata, skoda
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, parse_qs

import websockets
from websockets.exceptions import ConnectionClosed

from config import Config
from audio_processor import AudioProcessor, AudioRates
from gemini_live import GeminiLiveSession, GeminiSessionConfig
from data_storage import AgentDataStorage
from payload_builder import SIPayloadBuilder
from payload_template_renderer import render_payload_template
from admin_client import AdminClient


@dataclass
class TelephonySession:
    ucid: str
    agent: str
    client_ws: websockets.WebSocketServerProtocol
    gemini: GeminiLiveSession
    input_buffer: list[int]
    output_buffer: list[int]
    closed: bool = False
    # Transcript capture
    conversation: List[Dict[str, Any]] = field(default_factory=list)
    start_time: Optional[datetime] = None
    customer_number: Optional[str] = None
    store_code: Optional[str] = None


# Supported agents and their prompt files (fallback if API unavailable)
AGENT_PROMPTS = {
    "spotlight": "kia_prompt.txt",  # Kia v2 (Gemini Live) - active testing
    "tata": "tata_prompt.txt",
    "skoda": "skoda_prompt.txt",
}

VALID_AGENTS = set(AGENT_PROMPTS.keys())

# Admin UI API URL for fetching prompts (runs on same VM)
ADMIN_API_BASE = os.getenv("ADMIN_API_BASE", "http://127.0.0.1:3100")


def _fetch_prompt_from_api(agent: str) -> Optional[str]:
    """
    Fetch system instructions from Admin UI API.
    Returns None if API is unavailable or agent not found.
    """
    import urllib.request
    import urllib.error
    
    url = f"{ADMIN_API_BASE}/api/telephony/prompt/{agent.lower()}"
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                instructions = data.get("systemInstructions", "")
                if instructions and instructions.strip():
                    print(f"[telephony] ✅ Loaded prompt from API for agent: {agent}")
                    return instructions
    except urllib.error.HTTPError as e:
        print(f"[telephony] ⚠️ API error for {agent}: HTTP {e.code}")
    except Exception as e:
        print(f"[telephony] ⚠️ API unavailable for {agent}: {e}")
    return None


def _read_prompt_from_file(agent: str) -> str:
    """Load prompt from local .txt file (fallback)."""
    agent_lower = agent.lower()
    prompt_filename = AGENT_PROMPTS.get(agent_lower, "kia_prompt.txt")
    prompt_file = os.path.join(os.path.dirname(__file__), prompt_filename)
    
    try:
        with open(prompt_file, "r", encoding="utf-8") as f:
            print(f"[telephony] 📄 Loaded prompt from file: {prompt_filename}")
            return f.read()
    except FileNotFoundError:
        return f"You are a helpful {agent} sales assistant. Be concise and friendly."
    except Exception:
        return "You are a helpful sales assistant. Be concise and friendly."


def _read_prompt_text(agent: str = "spotlight") -> str:
    """
    Load prompt for the specified agent.
    Priority: 1) Admin UI API (database), 2) Local .txt file (fallback)
    """
    # Try API first (allows editing via Admin UI)
    api_prompt = _fetch_prompt_from_api(agent)
    if api_prompt:
        return api_prompt
    
    # Fallback to local file
    return _read_prompt_from_file(agent)


def _extract_audio_b64_from_gemini_message(msg: Dict[str, Any]) -> Optional[str]:
    parts = msg.get("serverContent", {}).get("modelTurn", {}).get("parts") or []
    if not parts:
        return None
    inline = parts[0].get("inlineData") if isinstance(parts[0], dict) else None
    if inline and isinstance(inline, dict):
        return inline.get("data")
    return None


def _is_interrupted(msg: Dict[str, Any]) -> bool:
    return bool(msg.get("serverContent", {}).get("interrupted"))


def _extract_transcription(msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract transcription text from Gemini message.
    
    Input transcription: serverContent.inputTranscription.text
    Output transcription: serverContent.modelTurn.parts[].text
    """
    server_content = msg.get("serverContent", {})
    
    # Input transcription (user speech)
    input_trans = server_content.get("inputTranscription", {})
    if input_trans and input_trans.get("text"):
        return {
            "speaker": "user",
            "text": input_trans["text"],
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    
    # Output transcription (model speech) - from modelTurn parts with text
    model_turn = server_content.get("modelTurn", {})
    parts = model_turn.get("parts", [])
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            return {
                "speaker": "assistant",
                "text": part["text"],
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
    
    return None


async def _audio_sender(
    session: TelephonySession, cfg: Config
) -> None:
    """
    Drip-feed audio chunks to telephony at real-time rate.

    WHY THIS IS CRITICAL FOR BARGE-IN:
    Gemini generates audio faster than real-time and delivers it in bursts.
    If we forward all chunks instantly, the telephony provider (Waybeo) queues
    up several seconds of audio. When the user interrupts, clearing our local
    buffer does nothing — Waybeo keeps playing its queued audio.

    By pacing output at real-time rate (one 100ms chunk every 100ms), the local
    output_buffer acts as the playback queue. On barge-in, clearing the buffer
    immediately stops audio delivery — max overshoot is one chunk (~100ms).
    """
    import time

    chunk_samples = cfg.AUDIO_BUFFER_SAMPLES_OUTPUT
    chunk_duration = cfg.AUDIO_BUFFER_MS_OUTPUT / 1000.0  # seconds
    next_send_time: float | None = None

    try:
        while not session.closed:
            if len(session.output_buffer) >= chunk_samples:
                now = time.monotonic()

                # Pace: if we have a scheduled time, wait until then
                if next_send_time is not None:
                    wait = next_send_time - now
                    if wait > 0:
                        await asyncio.sleep(wait)
                        # Re-check buffer — may have been cleared by barge-in
                        if len(session.output_buffer) < chunk_samples:
                            next_send_time = None
                            continue

                chunk = session.output_buffer[:chunk_samples]
                session.output_buffer = session.output_buffer[chunk_samples:]

                payload = {
                    "event": "media",
                    "type": "media",
                    "ucid": session.ucid,
                    "data": {
                        "samples": chunk,
                        "bitsPerSample": 16,
                        "sampleRate": cfg.TELEPHONY_SR,
                        "channelCount": 1,
                        "numberOfFrames": len(chunk),
                        "type": "data",
                    },
                }
                if session.client_ws.open:
                    await session.client_ws.send(json.dumps(payload))
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 🔊 Sent {len(chunk)} samples to telephony")

                # Schedule next send at exactly one chunk_duration later
                if next_send_time is None:
                    next_send_time = time.monotonic() + chunk_duration
                else:
                    next_send_time += chunk_duration
                    # Prevent drift accumulation: if we fell too far behind, reset
                    if next_send_time < time.monotonic() - chunk_duration:
                        next_send_time = time.monotonic() + chunk_duration
            else:
                # Buffer empty — reset pacing and poll quickly
                next_send_time = None
                await asyncio.sleep(0.005)  # 5ms polling
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Audio sender error: {e}")


async def _gemini_reader(
    session: TelephonySession, audio_processor: AudioProcessor, cfg: Config
) -> None:
    """
    Read messages from Gemini Live and buffer audio for the drip-feed sender.
    Does NOT send audio directly — _audio_sender handles paced delivery.
    """
    try:
        async for msg in session.gemini.messages():
            if cfg.DEBUG:
                if msg.get("setupComplete"):
                    print(f"[{session.ucid}] 🏁 Gemini setupComplete")

            if _is_interrupted(msg):
                # Barge-in: clear the output buffer immediately.
                # Since _audio_sender drip-feeds at real-time rate, clearing
                # the buffer stops audio delivery within ~5ms (one poll cycle).
                if cfg.LOG_TRANSCRIPTS:
                    print(f"[{session.ucid}] 🛑 Gemini interrupted → clearing output buffer")
                session.output_buffer.clear()

                # Also send clear event in case telephony provider supports it
                try:
                    clear_payload = {
                        "event": "clear",
                        "ucid": session.ucid,
                    }
                    await session.client_ws.send(json.dumps(clear_payload))
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 🔇 Sent clear event to telephony")
                except Exception:
                    pass
                continue

            # Capture transcription if present
            transcription = _extract_transcription(msg)
            if transcription:
                session.conversation.append(transcription)
                if cfg.LOG_TRANSCRIPTS:
                    speaker = transcription["speaker"]
                    text = transcription["text"][:50] + "..." if len(transcription["text"]) > 50 else transcription["text"]
                    print(f"[{session.ucid}] 📝 {speaker}: {text}")

            audio_b64 = _extract_audio_b64_from_gemini_message(msg)
            if not audio_b64:
                continue

            # Buffer audio — the _audio_sender task handles paced delivery
            samples_8k = audio_processor.process_output_gemini_b64_to_8k_samples(audio_b64)

            # Crossfade at chunk boundary to prevent clicks/pops between
            # independently-resampled Gemini audio chunks
            XFADE = 8  # 8 samples = 1ms at 8kHz — imperceptible but smooths edges
            if session.output_buffer and len(samples_8k) > XFADE:
                buf_len = len(session.output_buffer)
                for i in range(min(XFADE, buf_len)):
                    alpha = (i + 1) / XFADE
                    idx = buf_len - XFADE + i
                    if idx >= 0:
                        session.output_buffer[idx] = int(
                            session.output_buffer[idx] * (1 - alpha) + samples_8k[i] * alpha
                        )
                session.output_buffer.extend(samples_8k[XFADE:])
            else:
                session.output_buffer.extend(samples_8k)
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Gemini reader error: {e}")


async def handle_client(client_ws, path: str):
    cfg = Config()
    Config.validate(cfg)

    # websockets passes the request path including querystring (e.g. "/wsNew1?agent=spotlight").
    # Waybeo/Ozonetel commonly append query params; accept those as long as the base path matches.
    parsed_url = urlparse(path or "")
    base_path = parsed_url.path
    query_params = parse_qs(parsed_url.query)
    
    # Extract agent parameter (default to "spotlight" for Kia)
    agent = query_params.get("agent", ["spotlight"])[0]

    # Only accept configured base path (e.g. /ws or /wsNew1)
    if base_path != cfg.WS_PATH:
        if cfg.DEBUG:
            print(
                f"[telephony] ❌ Rejecting connection: path={path!r} base_path={base_path!r} expected={cfg.WS_PATH!r}"
            )
        await client_ws.close(code=1008, reason="Invalid path")
        return

    # Strict validation: reject unknown agents
    if agent.lower() not in VALID_AGENTS:
        print(f"[telephony] ❌ Rejecting unknown agent: {agent!r} (valid: {VALID_AGENTS})")
        await client_ws.close(code=1008, reason=f"Unknown agent: {agent}")
        return

    if cfg.DEBUG:
        print(f"[telephony] 🎯 Agent: {agent}")

    rates = AudioRates(
        telephony_sr=cfg.TELEPHONY_SR,
        gemini_input_sr=cfg.GEMINI_INPUT_SR,
        gemini_output_sr=cfg.GEMINI_OUTPUT_SR,
    )
    audio_processor = AudioProcessor(rates)

    prompt = _read_prompt_text(agent)

    service_url = (
        "wss://us-central1-aiplatform.googleapis.com/ws/"
        "google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
    )
    gemini_cfg = GeminiSessionConfig(
        service_url=service_url,
        model_uri=cfg.model_uri,
        voice=cfg.GEMINI_VOICE,
        system_instructions=prompt,
        temperature=1.0,  # Default: natural, conversational responses (Artemis-style)
        enable_affective_dialog=True,  # Enabled: natural vocal prosody (warmth without excitement)
        enable_input_transcription=True,   # Enable for transcript capture
        enable_output_transcription=True,  # Enable for transcript capture
        vad_silence_ms=150,   # Aggressive for fast barge-in detection
        vad_prefix_ms=100,    # Low prefix for faster activity detection onset
        activity_handling="START_OF_ACTIVITY_INTERRUPTS",
    )

    # Create session with temporary ucid until 'start' arrives
    ucid = "UNKNOWN"
    gemini = GeminiLiveSession(gemini_cfg)

    session = TelephonySession(
        ucid=ucid,
        agent=agent,
        client_ws=client_ws,
        gemini=gemini,
        input_buffer=[],
        output_buffer=[],
        conversation=[],
        start_time=datetime.utcnow(),
    )

    try:
        # Start Gemini connection EARLY (in parallel with waiting for start event)
        # This reduces initial latency by ~4 seconds as Gemini warms up in parallel
        if cfg.LOG_TRANSCRIPTS:
            print(f"[telephony] 🚀 Starting Gemini connection early...")
        gemini_connect_task = asyncio.create_task(session.gemini.connect())

        # Wait for start event to get real UCID
        first = await asyncio.wait_for(client_ws.recv(), timeout=10.0)
        start_msg = json.loads(first)
        if start_msg.get("event") != "start":
            gemini_connect_task.cancel()
            await client_ws.close(code=1008, reason="Expected start event")
            return

        session.ucid = (
            start_msg.get("ucid")
            or start_msg.get("start", {}).get("ucid")
            or start_msg.get("data", {}).get("ucid")
            or "UNKNOWN"
        )

        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] 🎬 start event received on path={path}")

        # Wait for Gemini connection (started earlier for speed)
        await gemini_connect_task
        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] ✅ Connected to Gemini Live")

        # Start audio sender (drip-feeds buffered audio at real-time rate)
        sender_task = asyncio.create_task(_audio_sender(session, cfg))

        # Start reader task so we catch the greeting audio
        gemini_task = asyncio.create_task(_gemini_reader(session, audio_processor, cfg))

        # Trigger greeting immediately - don't wait for user audio
        await session.gemini.trigger_greeting()
        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] 🎙️ Greeting triggered")

        # Process remaining messages
        async for raw in client_ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = msg.get("event")
            if event in {"stop", "end", "close"}:
                if cfg.LOG_TRANSCRIPTS:
                    print(f"[{session.ucid}] 📞 stop event received")
                break

            if event == "media" and msg.get("data"):
                samples = msg["data"].get("samples", [])
                if not samples:
                    continue

                session.input_buffer.extend(samples)

                # Track audio chunks sent to Gemini
                chunks_sent = 0
                while len(session.input_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_INPUT:
                    chunk = session.input_buffer[: cfg.AUDIO_BUFFER_SAMPLES_INPUT]
                    session.input_buffer = session.input_buffer[cfg.AUDIO_BUFFER_SAMPLES_INPUT :]

                    samples_np = audio_processor.waybeo_samples_to_np(chunk)
                    audio_b64 = audio_processor.process_input_8k_to_gemini_16k_b64(samples_np)
                    await session.gemini.send_audio_b64_pcm16(audio_b64)
                    chunks_sent += 1

                if cfg.DEBUG and chunks_sent > 0:
                    print(f"[{session.ucid}] 🎤 Sent {chunks_sent} audio chunk(s) to Gemini ({len(samples)} samples received)")

        session.closed = True
        gemini_task.cancel()
        sender_task.cancel()
        try:
            await gemini_task
        except asyncio.CancelledError:
            pass
        try:
            await sender_task
        except asyncio.CancelledError:
            pass

        # Save call data on normal completion
        await _save_call_data(session, cfg)

    except asyncio.TimeoutError:
        await client_ws.close(code=1008, reason="Timeout waiting for start event")
    except ConnectionClosed:
        # Save data even on connection close
        await _save_call_data(session, cfg)
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Telephony handler error: {e}")
        # Save data even on error
        await _save_call_data(session, cfg)
    finally:
        session.closed = True  # Ensure _audio_sender exits in all paths
        try:
            await session.gemini.close()
        except Exception:
            pass


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return None


async def _save_call_data(session: TelephonySession, cfg: Config) -> None:
    """
    Save call data to files, push to Admin UI, and deliver to external webhooks.
    Called at end of call (normal, disconnect, or error).
    """
    if session.ucid == "UNKNOWN":
        return

    if not session.conversation:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ⚠️ No conversation to save")
        return

    end_time = datetime.utcnow()
    duration_sec = int((end_time - session.start_time).total_seconds()) if session.start_time else 0

    print(f"[{session.ucid}] 💾 Saving call data ({len(session.conversation)} entries, {duration_sec}s)")

    try:
        # Initialize storage and clients
        storage = AgentDataStorage(session.agent, cfg)
        payload_builder = SIPayloadBuilder(
            agent=session.agent,
            call_id=session.ucid,
            customer_number=session.customer_number,
            store_code=session.store_code,
        )
        admin_client = AdminClient(cfg)

        # Fetch agent config for webhook endpoints
        agent_config = admin_client.fetch_agent_config(session.agent)

        # Save transcript first, then build payload from saved transcript
        transcript_path = storage.save_transcript(
            call_id=session.ucid,
            conversation=session.conversation,
            metadata={
                "agent": session.agent,
                "duration_sec": duration_sec,
                "start_time": session.start_time.isoformat() + "Z" if session.start_time else None,
                "end_time": end_time.isoformat() + "Z",
            },
        )
        if not transcript_path:
            print(f"[{session.ucid}] ❌ Transcript save failed; skipping payload build")
            return

        transcript_data = storage.load_transcript(transcript_path)
        if not transcript_data:
            print(f"[{session.ucid}] ❌ Transcript load failed; skipping payload build")
            return

        transcript_conversation = transcript_data.get("conversation") or []
        transcript_metadata = transcript_data.get("metadata") or {}
        transcript_start = _parse_iso_datetime(transcript_metadata.get("start_time"))
        transcript_end = _parse_iso_datetime(transcript_metadata.get("end_time"))
        transcript_duration = transcript_metadata.get("duration_sec") or duration_sec

        response_data = payload_builder.extract_response_data(transcript_conversation)
        completion_status = payload_builder.determine_completion_status(response_data)
        extracted_data = payload_builder.build_extracted_map(response_data)

        transcript_text = "\n".join(
            f"[{entry.get('timestamp')}] {entry.get('speaker', '').upper()}: {entry.get('text', '')}"
            for entry in transcript_conversation
        )
        user_messages = sum(
            1 for entry in transcript_conversation if entry.get("speaker") == "user"
        )
        assistant_messages = sum(
            1 for entry in transcript_conversation if entry.get("speaker") == "agent"
        )
        analytics = {
            "total_exchanges": len(transcript_conversation),
            "user_messages": user_messages,
            "assistant_messages": assistant_messages,
        }

        # Build Admin UI payload (internal format)
        si_payload = payload_builder.build_payload(
            conversation=transcript_conversation,
            start_time=transcript_start or session.start_time,
            end_time=transcript_end or end_time,
            duration_sec=transcript_duration,
        )

        storage.save_si_payload(session.ucid, si_payload)

        # Push to Admin UI database
        await admin_client.push_call_data(si_payload, session.ucid)

        # Deliver to external webhooks if configured
        if agent_config:
            si_template = agent_config.get("siPayloadTemplate")
            waybeo_template = agent_config.get("waybeoPayloadTemplate")
            customer_name = agent_config.get("siCustomerName") or payload_builder.customer_name

            # Detect language from conversation (check if mostly Hindi or English)
            detected_language = "hindi"  # default
            english_count = 0
            hindi_markers = ["ji", "haan", "nahi", "aap", "hai", "mein", "kya", "naam"]
            for entry in transcript_conversation:
                text_lower = (entry.get("text") or "").lower()
                # Count entries with common English words and no Hindi markers
                if any(w in text_lower for w in ["yes", "no", "please", "thank", "want", "interested"]):
                    if not any(w in text_lower for w in hindi_markers):
                        english_count += 1
            if english_count > len(transcript_conversation) * 0.3:
                detected_language = "english"

            # Determine transfer status from dealer_routing in SI payload
            dealer_routing = si_payload.get("dealer_routing", {})
            transfer_status = "transferred" if dealer_routing.get("status") else "not_transferred"
            transfer_reason = dealer_routing.get("reason", "User decided")

            template_context = {
                "call_id": session.ucid,
                "agent_slug": session.agent,
                "agent_name": agent_config.get("name") if agent_config else session.agent,
                "customer_name": customer_name,
                "store_code": session.store_code or "",
                "customer_number": session.customer_number or "",
                "start_time": (transcript_start or session.start_time or end_time).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
                "end_time": (transcript_end or end_time).strftime("%Y-%m-%d %H:%M:%S"),
                "duration_sec": transcript_duration,
                "completion_status": completion_status,
                "detected_language": detected_language,
                "transfer_status": transfer_status,
                "transfer_reason": transfer_reason,
                "response_data": response_data,
                "transcript": transcript_conversation,
                "transcript_text": transcript_text,
                "extracted": extracted_data,
                "analytics": analytics,
            }

            if si_template:
                rendered_si = render_payload_template(si_template, template_context)
                if rendered_si.missing_placeholders:
                    print(
                        f"[{session.ucid}] ⚠️ SI template missing values for: "
                        f"{', '.join(rendered_si.missing_placeholders)}"
                    )
                si_webhook_payload = rendered_si.payload
            else:
                si_webhook_payload = si_payload

            # SI webhook
            si_endpoint = agent_config.get("siEndpointUrl")
            si_auth = agent_config.get("siAuthHeader")
            if si_endpoint:
                print(f"[{session.ucid}] 📤 Delivering to SI webhook: {si_endpoint[:50]}...")
                await admin_client.push_to_si_webhook(
                    payload=si_webhook_payload,
                    endpoint_url=si_endpoint,
                    auth_header=si_auth,
                    call_id=session.ucid,
                )

            # Waybeo webhook
            waybeo_endpoint = agent_config.get("waybeoEndpointUrl")
            waybeo_auth = agent_config.get("waybeoAuthHeader")
            if waybeo_endpoint:
                if waybeo_template:
                    rendered_waybeo = render_payload_template(
                        waybeo_template, template_context
                    )
                    if rendered_waybeo.missing_placeholders:
                        print(
                            f"[{session.ucid}] ⚠️ Waybeo template missing values for: "
                            f"{', '.join(rendered_waybeo.missing_placeholders)}"
                        )
                    waybeo_payload = rendered_waybeo.payload
                else:
                    # Build Waybeo payload (simpler format)
                    waybeo_payload = {
                        "ucid": session.ucid,
                        "call_status": si_payload.get("completion_status", "incomplete"),
                        "call_start_time": si_payload.get("start_time", ""),
                        "call_end_time": si_payload.get("end_time", ""),
                        "call_duration": duration_sec,
                        "caller_number": session.customer_number or "",
                        "agent_id": session.agent,
                        "store_code": session.store_code or "",
                    }
                print(f"[{session.ucid}] 📤 Delivering to Waybeo webhook: {waybeo_endpoint[:50]}...")
                await admin_client.push_to_waybeo_webhook(
                    payload=waybeo_payload,
                    endpoint_url=waybeo_endpoint,
                    auth_header=waybeo_auth,
                    call_id=session.ucid,
                )

    except Exception as e:
        print(f"[{session.ucid}] ❌ Error saving call data: {e}")


async def main() -> None:
    cfg = Config()
    Config.validate(cfg)
    cfg.print_config()

    # websockets.serve passes (websocket, path) for the legacy API; handler accepts both.
    async with websockets.serve(handle_client, cfg.HOST, cfg.PORT):
        print(f"✅ Telephony WS listening on ws://{cfg.HOST}:{cfg.PORT}{cfg.WS_PATH}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Telephony service stopped")


