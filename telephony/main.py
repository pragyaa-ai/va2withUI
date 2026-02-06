"""
VoiceAgent Telephony WebSocket service (Gemini Live backend).

This service bridges telephony audio to Gemini Live for AI-powered voice conversations.

Protocol:
Client sends JSON messages with:
- event: "start" | "media" | "stop"
- ucid: string (call/session id)
- data.samples: number[] (int16 PCM samples at 8kHz)

Audio Processing:
- Telephony 8kHz -> resample -> Gemini 16kHz PCM16 base64
- Gemini audio output (24kHz PCM16 base64) -> resample -> Telephony 8kHz samples

Multi-agent support:
- Routes to different prompts based on ?agent=xxx query parameter
- Agent configuration is loaded from Admin UI database
- Fallback to local sample_prompt.txt if API unavailable
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


# Fallback prompt file for new agents without API configuration
DEFAULT_PROMPT_FILE = "sample_prompt.txt"

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
                    print(f"[telephony] Loaded prompt from API for agent: {agent}")
                    return instructions
    except urllib.error.HTTPError as e:
        print(f"[telephony] API error for {agent}: HTTP {e.code}")
    except Exception as e:
        print(f"[telephony] API unavailable for {agent}: {e}")
    return None


def _read_prompt_from_file(agent: str) -> str:
    """Load prompt from local .txt file (fallback)."""
    prompt_file = os.path.join(os.path.dirname(__file__), DEFAULT_PROMPT_FILE)
    
    try:
        with open(prompt_file, "r", encoding="utf-8") as f:
            print(f"[telephony] Loaded prompt from file: {DEFAULT_PROMPT_FILE}")
            return f.read()
    except FileNotFoundError:
        return f"You are a helpful {agent} assistant. Be concise and friendly."
    except Exception:
        return "You are a helpful assistant. Be concise and friendly."


def _read_prompt_text(agent: str = "demo") -> str:
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


async def _gemini_reader(
    session: TelephonySession, audio_processor: AudioProcessor, cfg: Config
) -> None:
    try:
        async for msg in session.gemini.messages():
            if cfg.DEBUG:
                if msg.get("setupComplete"):
                    print(f"[{session.ucid}] Gemini setupComplete")

            if _is_interrupted(msg):
                # Barge-in: clear any queued audio to telephony
                if cfg.LOG_TRANSCRIPTS:
                    print(f"[{session.ucid}] Gemini interrupted - clearing output buffer")
                session.output_buffer.clear()
                continue

            # Capture transcription if present
            transcription = _extract_transcription(msg)
            if transcription:
                session.conversation.append(transcription)
                if cfg.LOG_TRANSCRIPTS:
                    speaker = transcription["speaker"]
                    text = transcription["text"][:50] + "..." if len(transcription["text"]) > 50 else transcription["text"]
                    print(f"[{session.ucid}] {speaker}: {text}")

            audio_b64 = _extract_audio_b64_from_gemini_message(msg)
            if not audio_b64:
                continue

            samples_8k = audio_processor.process_output_gemini_b64_to_8k_samples(audio_b64)
            session.output_buffer.extend(samples_8k)

            # send consistent chunks
            while len(session.output_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_OUTPUT:
                chunk = session.output_buffer[: cfg.AUDIO_BUFFER_SAMPLES_OUTPUT]
                session.output_buffer = session.output_buffer[cfg.AUDIO_BUFFER_SAMPLES_OUTPUT :]

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
                        print(f"[{session.ucid}] Sent {len(chunk)} samples to telephony")
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] Gemini reader error: {e}")


async def handle_client(client_ws, path: str):
    cfg = Config()
    Config.validate(cfg)

    # websockets passes the request path including querystring (e.g. "/ws?agent=demo-sales").
    # Telephony providers commonly append query params; accept those as long as the base path matches.
    parsed_url = urlparse(path or "")
    base_path = parsed_url.path
    query_params = parse_qs(parsed_url.query)
    
    # Extract agent parameter (default to "demo" for demo agent)
    agent = query_params.get("agent", ["demo"])[0]

    # Only accept configured base path (e.g. /ws)
    if base_path != cfg.WS_PATH:
        if cfg.DEBUG:
            print(
                f"[telephony] Rejecting connection: path={path!r} base_path={base_path!r} expected={cfg.WS_PATH!r}"
            )
        await client_ws.close(code=1008, reason="Invalid path")
        return

    if cfg.DEBUG:
        print(f"[telephony] Agent: {agent}")

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
        enable_affective_dialog=True,
        enable_input_transcription=True,   # Enable for transcript capture
        enable_output_transcription=True,  # Enable for transcript capture
        vad_silence_ms=500,   # VAD silence threshold
        vad_prefix_ms=500,    # VAD prefix padding
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
        # Wait for start event to get real UCID before connecting upstream
        first = await asyncio.wait_for(client_ws.recv(), timeout=10.0)
        start_msg = json.loads(first)
        if start_msg.get("event") != "start":
            await client_ws.close(code=1008, reason="Expected start event")
            return

        session.ucid = (
            start_msg.get("ucid")
            or start_msg.get("start", {}).get("ucid")
            or start_msg.get("data", {}).get("ucid")
            or "UNKNOWN"
        )

        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] start event received on path={path}")

        # Connect to Gemini
        await session.gemini.connect()
        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] Connected to Gemini Live")

        # Start reader task FIRST so we catch the greeting audio
        gemini_task = asyncio.create_task(_gemini_reader(session, audio_processor, cfg))

        # Trigger greeting immediately - don't wait for user audio
        await session.gemini.trigger_greeting()
        if cfg.LOG_TRANSCRIPTS:
            print(f"[{session.ucid}] Greeting triggered")

        # Process remaining messages
        async for raw in client_ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = msg.get("event")
            if event in {"stop", "end", "close"}:
                if cfg.LOG_TRANSCRIPTS:
                    print(f"[{session.ucid}] stop event received")
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
                    print(f"[{session.ucid}] Sent {chunks_sent} audio chunk(s) to Gemini ({len(samples)} samples received)")

        gemini_task.cancel()
        try:
            await gemini_task
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
            print(f"[{session.ucid}] Telephony handler error: {e}")
        # Save data even on error
        await _save_call_data(session, cfg)
    finally:
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
            print(f"[{session.ucid}] No conversation to save")
        return

    end_time = datetime.utcnow()
    duration_sec = int((end_time - session.start_time).total_seconds()) if session.start_time else 0

    print(f"[{session.ucid}] Saving call data ({len(session.conversation)} entries, {duration_sec}s)")

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
                print(f"[{session.ucid}] Delivering to SI webhook: {si_endpoint[:50]}...")
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
                print(f"[{session.ucid}] Delivering to Waybeo webhook: {waybeo_endpoint[:50]}...")
                await admin_client.push_to_waybeo_webhook(
                    payload=waybeo_payload,
                    endpoint_url=waybeo_endpoint,
                    auth_header=waybeo_auth,
                    call_id=session.ucid,
                )

    except Exception as e:
        print(f"[{session.ucid}] Error saving call data: {e}")


async def main() -> None:
    cfg = Config()
    Config.validate(cfg)
    cfg.print_config()

    # websockets.serve passes (websocket, path) for the legacy API; handler accepts both.
    async with websockets.serve(handle_client, cfg.HOST, cfg.PORT):
        print(f"Telephony WS listening on ws://{cfg.HOST}:{cfg.PORT}{cfg.WS_PATH}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTelephony service stopped")
