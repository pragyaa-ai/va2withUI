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
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta

# IST timezone (UTC+5:30) for log timestamps
IST = timezone(timedelta(hours=5, minutes=30))

def _now_ist() -> datetime:
    """Get current time in IST."""
    return datetime.now(IST)

def _ist_str() -> str:
    """Get IST timestamp string for logs."""
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, parse_qs

import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed

from config import Config
from audio_processor import AudioProcessor, AudioRates
from gemini_live import GeminiLiveSession, GeminiSessionConfig
from data_storage import AgentDataStorage
from payload_builder import SIPayloadBuilder
from payload_template_renderer import render_payload_template
from admin_client import AdminClient
from gemini_extractor import (
    GeminiExtractor,
    build_response_data_from_extraction,
    build_extracted_map,
)


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
    call_start_time: float = field(default_factory=time.time)  # For safeguard timing
    customer_number: Optional[str] = None
    store_code: Optional[str] = None
    # Waybeo headers received when call is initiated (for Admin UI display + data extraction)
    waybeo_headers: Optional[Dict[str, str]] = None
    # Transfer/hangup state (set by Gemini 2.5 Live function calls)
    transfer_number: Optional[str] = None
    user_wants_transfer: Optional[bool] = None
    call_ending: bool = False
    hangup_sent: bool = False
    # Call control event tracking (for Admin UI)
    call_control_event: Optional[Dict[str, Any]] = None
    waybeo_payload: Optional[Dict[str, Any]] = None
    # Webhook response tracking (for Admin UI display)
    si_webhook_response: Optional[Dict[str, Any]] = None
    waybeo_webhook_response: Optional[Dict[str, Any]] = None


# ────────────────────────────────────────────────────────────────────────────
# Function Call Handling (Gemini 2.5 Live)
# ────────────────────────────────────────────────────────────────────────────
# 
# Gemini 2.5 Live handles all call control decisions via function calling:
# 1. Agent asks: "Would you like to talk to an agent?"
# 2. User responds Yes/No
# 3. Gemini calls transfer_call() or end_call() based on user response
#
# No pattern matching, no silence detection - Gemini makes all decisions.
# ────────────────────────────────────────────────────────────────────────────


def _extract_function_call(msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract function call from Gemini Live 2.5 message.
    
    Gemini calls transfer_call() or end_call() based on conversation.
    Returns dict with name, args, and id (for sending function responses back).
    """
    server_content = msg.get("serverContent", {})
    model_turn = server_content.get("modelTurn", {})
    parts = model_turn.get("parts", [])
    
    for part in parts:
        if isinstance(part, dict) and "functionCall" in part:
            func_call = part["functionCall"]
            return {
                "name": func_call.get("name"),
                "args": func_call.get("args", {}),
                "id": func_call.get("id", ""),
            }
    
    # Alternative: check toolCall at root level
    tool_call = msg.get("toolCall")
    if tool_call:
        func_calls = tool_call.get("functionCalls", [])
        if func_calls:
            return {
                "name": func_calls[0].get("name"),
                "args": func_calls[0].get("args", {}),
                "id": func_calls[0].get("id", ""),
            }
    
    return None


# ────────────────────────────────────────────────────────────────────────────
# Telephony Control Events (Waybeo/Ozonetel)
# ────────────────────────────────────────────────────────────────────────────

async def _waybeo_api_command(session: TelephonySession, command: str, cfg: "Config") -> bool:
    """
    Send a command to Waybeo via their HTTP API.
    
    Waybeo expects POST to their bot-call endpoint with:
    {"command": "hangup_call"|"transfer_call", "callId": "<ucid>"}
    
    Args:
        session: Current telephony session
        command: "hangup_call" or "transfer_call"
        cfg: Config instance
    
    Returns:
        True if API call succeeded
    """
    if not cfg.WAYBEO_AUTH_TOKEN:
        print(f"[{session.ucid}] ⚠️ WAYBEO_AUTH_TOKEN not configured - cannot send {command}")
        return False
    
    api_url = cfg.WAYBEO_API_URL
    payload = {
        "command": command,
        "callId": session.ucid,
    }
    
    try:
        async with aiohttp.ClientSession() as http_session:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cfg.WAYBEO_AUTH_TOKEN}",
            }
            print(f"[{session.ucid}] 🔄 Waybeo API → {command} (POST {api_url})")
            async with http_session.post(api_url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp_text = await resp.text()
                if resp.status < 300:
                    print(f"[{session.ucid}] ✅ Waybeo {command} API success: HTTP {resp.status}")
                    return True
                else:
                    print(f"[{session.ucid}] ❌ Waybeo {command} API failed: HTTP {resp.status} - {resp_text[:200]}")
                    return False
    except Exception as e:
        print(f"[{session.ucid}] ❌ Waybeo {command} API error: {e}")
        return False


async def send_transfer_event(session: TelephonySession, transfer_number: str, cfg: "Config") -> bool:
    """
    Send transfer command to Waybeo via HTTP API.
    
    Uses Waybeo's bot-call HTTP endpoint (same as singleinterface).
    WebSocket stays open - Waybeo closes it after transfer completes.
    
    Args:
        session: Current telephony session
        transfer_number: Phone number to transfer to (dealer)
        cfg: Config instance
        
    Returns:
        True if event sent successfully
    """
    try:
        # Primary: Use Waybeo HTTP API (correct protocol)
        api_success = await _waybeo_api_command(session, "transfer_call", cfg)
        
        if api_success:
            print(f"[{_ist_str()}] [{session.ucid}] 📞 Transfer sent via Waybeo API → {transfer_number}")
            return True
        
        # Fallback: Send WebSocket event (legacy, may not work)
        print(f"[{session.ucid}] ⚠️ Waybeo API failed, trying WebSocket fallback...")
        transfer_payload = {
            "event": "transfer",
            "ucid": session.ucid,
            "phone": transfer_number,
            "reason": "Customer requested transfer to dealer",
        }
        await session.client_ws.send(json.dumps(transfer_payload))
        print(f"[{session.ucid}] 📞 Transfer event sent via WebSocket → {transfer_number}")
        return True
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Failed to send transfer event: {e}")
        return False


async def send_hangup_event(session: TelephonySession, cfg: "Config", reason: str = "Call completed") -> bool:
    """
    Send hangup command to Waybeo via HTTP API, then close WebSocket.
    
    Uses Waybeo's bot-call HTTP endpoint for the hangup command,
    then closes the WebSocket connection as final cleanup.
    
    Args:
        session: Current telephony session
        cfg: Config instance
        reason: Reason for hangup
        
    Returns:
        True if event sent successfully
    """
    try:
        # Primary: Use Waybeo HTTP API (correct protocol)
        api_success = await _waybeo_api_command(session, "hangup_call", cfg)
        
        if api_success:
            print(f"[{session.ucid}] 📞 Hangup sent via Waybeo API: {reason}")
        else:
            # Fallback: Send WebSocket event (legacy)
            print(f"[{session.ucid}] ⚠️ Waybeo API hangup failed, trying WebSocket fallback...")
            try:
                hangup_payload = {
                    "event": "hangup",
                    "ucid": session.ucid,
                    "reason": reason,
                }
                await session.client_ws.send(json.dumps(hangup_payload))
                print(f"[{session.ucid}] 📞 Hangup sent via WebSocket: {reason}")
            except Exception:
                pass
        
        # Close the WebSocket connection to ensure call ends
        # This is the definitive way to end the call - closing the WS
        # signals to Waybeo that the bot is done
        try:
            if session.client_ws.open:
                await session.client_ws.close(code=1000, reason=reason)
                print(f"[{session.ucid}] 📞 WebSocket closed (hangup)")
        except Exception as close_err:
            print(f"[{session.ucid}] ⚠️ WebSocket close error: {close_err}")
        
        return True
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Failed to send hangup event: {e}")
        return False


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


def _extract_transcription(msg: Dict[str, Any], debug: bool = False) -> Optional[Dict[str, Any]]:
    """
    Extract transcription text from Gemini message.
    
    Input transcription: serverContent.inputTranscription.text (user speech)
    Output transcription: serverContent.outputTranscription.text (agent speech)
    
    IMPORTANT: Agent speech contains corrected/confirmed data that should be
    used for extraction, as the agent confirms and corrects user input.
    """
    server_content = msg.get("serverContent", {})
    
    # Debug: log all keys in serverContent to see what Gemini is sending
    if debug and server_content:
        keys = list(server_content.keys())
        if keys and keys != ["modelTurn"]:  # Don't spam for audio-only messages
            print(f"[DEBUG] serverContent keys: {keys}")
    
    # Input transcription (user speech - raw, may have errors)
    input_trans = server_content.get("inputTranscription", {})
    if input_trans and input_trans.get("text"):
        return {
            "speaker": "user",
            "text": input_trans["text"],
            "timestamp": _now_ist().isoformat(),
        }
    
    # Output transcription (agent speech - contains confirmed/corrected data)
    output_trans = server_content.get("outputTranscription", {})
    if output_trans and output_trans.get("text"):
        return {
            "speaker": "agent",
            "text": output_trans["text"],
            "timestamp": _now_ist().isoformat(),
        }
    
    # Fallback: Check modelTurn for text parts (older API format)
    model_turn = server_content.get("modelTurn", {})
    parts = model_turn.get("parts", [])
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            return {
                "speaker": "agent",
                "text": part["text"],
                "timestamp": _now_ist().isoformat(),
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
                    # Audio output logging removed - too verbose
                    # Transcripts show agent speech instead

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
    
    Handles Gemini 2.5 Live function calls for call control:
    - transfer_call(): User said YES to speaking with agent
    - end_call(): User said NO or conversation complete
    
    All decisions made by Gemini 2.5 Live based on conversation.
    """
    try:
        async for msg in session.gemini.messages():
            if cfg.DEBUG:
                if msg.get("setupComplete"):
                    print(f"[{session.ucid}] 🏁 Gemini setupComplete")

            if _is_interrupted(msg):
                # Barge-in: clear the output buffer immediately.
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
                except Exception:
                    pass
                continue

            # ─────────────────────────────────────────────────────────────────
            # Handle Gemini 2.5 Live function calls (transfer/hangup)
            #
            # DESIGN: Trust Gemini 2.5's intelligence for ALL call control.
            # Gemini understands the full conversation context — it knows
            # what questions were asked and what the user responded.
            # NO transcript matching, NO keyword checking — just trust Gemini.
            #
            # Flow: Gemini calls function → we acknowledge → Gemini says
            # goodbye → turnComplete → we send hangup/transfer to telephony
            # ─────────────────────────────────────────────────────────────────
            func_call = _extract_function_call(msg)
            if func_call and not session.hangup_sent and not session.call_ending:
                func_name = func_call.get("name")
                func_args = func_call.get("args", {})
                func_id = func_call.get("id", "")
                reason = func_args.get("reason", "User decision")
                call_duration = time.time() - session.call_start_time
                
                # Minimal safeguard: reject only during initial WebSocket setup (<10s)
                # After that, trust Gemini completely — including on-demand transfer
                if call_duration < 10:
                    print(f"[{session.ucid}] ⚠️ REJECTED {func_name}() - too early ({call_duration:.0f}s, still setting up)")
                    try:
                        await session.gemini.send_function_response(
                            call_id=func_id,
                            func_name=func_name,
                            response={"error": "Call just started. Continue the conversation first."},
                        )
                    except Exception as e:
                        print(f"[{session.ucid}] ⚠️ Failed to send function rejection: {e}")
                
                elif func_name == "transfer_call":
                    print(f"[{session.ucid}] 📞 Gemini 2.5 → transfer_call(): {reason}")
                    session.user_wants_transfer = True
                    session.call_ending = True
                    # Send function response so Gemini can say goodbye
                    try:
                        await session.gemini.send_function_response(
                            call_id=func_id,
                            func_name=func_name,
                            response={"status": "ok", "action": "transferring to sales team"},
                        )
                    except Exception as e:
                        print(f"[{session.ucid}] ⚠️ Failed to send function response: {e}")
                    print(f"[{session.ucid}] ⏳ Waiting for goodbye message before transfer...")
                    
                elif func_name == "end_call":
                    print(f"[{session.ucid}] 📞 Gemini 2.5 → end_call(): {reason}")
                    session.user_wants_transfer = False
                    session.call_ending = True
                    # Send function response so Gemini can say goodbye
                    try:
                        await session.gemini.send_function_response(
                            call_id=func_id,
                            func_name=func_name,
                            response={"status": "ok", "action": "ending call gracefully"},
                        )
                    except Exception as e:
                        print(f"[{session.ucid}] ⚠️ Failed to send function response: {e}")
                    print(f"[{session.ucid}] ⏳ Waiting for goodbye message before hangup...")
            
            # ─────────────────────────────────────────────────────────────────
            # Handle turnComplete - if call is ending, NOW trigger hangup
            # This ensures Gemini finishes saying goodbye before we hangup
            # ─────────────────────────────────────────────────────────────────
            server_content = msg.get("serverContent", {})
            if server_content.get("turnComplete") and session.call_ending and not session.hangup_sent:
                print(f"[{session.ucid}] ✅ Goodbye message complete - triggering call end")
                asyncio.create_task(_handle_call_end(session, cfg))

            # Capture transcription if present
            transcription = _extract_transcription(msg, debug=cfg.DEBUG)
            if transcription:
                session.conversation.append(transcription)
                speaker = transcription["speaker"]
                text = transcription.get("text", "")
                
                # Always log transcripts (these are valuable)
                if cfg.LOG_TRANSCRIPTS:
                    display_text = text[:80] + "..." if len(text) > 80 else text
                    print(f"[{session.ucid}] 📝 {speaker}: {display_text}")

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


async def _handle_call_end(session: TelephonySession, cfg: Config) -> None:
    """
    Handle end of call - send transfer or hangup event to telephony provider.
    
    Called when agent says goodbye. Waits for audio to finish playing,
    then sends the appropriate event:
    - Transfer if user said YES to talking to sales team
    - Hangup if user said NO or didn't respond
    """
    if session.hangup_sent:
        return  # Already handled
    
    try:
        # Wait for output buffer to drain so goodbye audio plays
        # Check every 100ms, timeout after 5 seconds
        wait_time = 0
        while len(session.output_buffer) > 0 and wait_time < 5.0:
            await asyncio.sleep(0.1)
            wait_time += 0.1
        
        # Extra 500ms to ensure audio is fully delivered
        await asyncio.sleep(0.5)
        
        session.hangup_sent = True
        event_timestamp = _now_ist().isoformat()
        
        if session.user_wants_transfer:
            # User wants to talk to a sales agent - send transfer event
            # Get dealer number from agent config if available
            transfer_number = session.transfer_number or os.getenv("DEFAULT_TRANSFER_NUMBER", "")
            
            if transfer_number:
                print(f"[{session.ucid}] 📞 User requested transfer → calling Waybeo transfer API")
                await send_transfer_event(session, transfer_number, cfg)
                session.call_control_event = {
                    "type": "transfer",
                    "reason": "User requested to speak with sales agent",
                    "timestamp": event_timestamp,
                    "status": "sent",
                    "transfer_number": transfer_number,
                }
            else:
                # No transfer number configured, just hangup
                print(f"[{session.ucid}] ⚠️ Transfer requested but no number configured → hangup")
                await send_hangup_event(session, cfg, "Transfer requested but no number configured")
                session.call_control_event = {
                    "type": "hangup",
                    "reason": "Transfer requested but no number configured",
                    "timestamp": event_timestamp,
                    "status": "sent",
                }
        else:
            # User declined transfer or didn't respond - send hangup
            reason = "User declined agent transfer" if session.user_wants_transfer is False else "Call completed"
            print(f"[{_ist_str()}] [{session.ucid}] 📞 Calling Waybeo hangup API: {reason}")
            await send_hangup_event(session, cfg, reason)
            session.call_control_event = {
                "type": "hangup",
                "reason": reason,
                "timestamp": event_timestamp,
                "status": "sent",
            }
            
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ Error handling call end: {e}")


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
        temperature=0.7,  # Lower temperature for more measured, professional responses
        enable_affective_dialog=False,  # Disabled: prevent excited/emotional voice variations
        enable_input_transcription=True,   # Enable for transcript capture
        enable_output_transcription=True,  # Enable for transcript capture
        vad_silence_ms=150,   # Aggressive for fast barge-in detection
        vad_prefix_ms=100,    # Low prefix for faster activity detection onset
        activity_handling="START_OF_ACTIVITY_INTERRUPTS",
    )

    # ─────────────────────────────────────────────────────────────────
    # Capture Waybeo WebSocket headers (sent when call is initiated)
    # These contain: call_id, customer_number, store_code, etc.
    # ─────────────────────────────────────────────────────────────────
    waybeo_headers: Dict[str, str] = {}
    try:
        # websockets v12+: request_headers is a Headers object
        raw_headers = getattr(client_ws, "request_headers", None)
        if raw_headers:
            waybeo_headers = {k: v for k, v in raw_headers.raw_items()}
        else:
            # Fallback: try request.headers (newer websockets API)
            request = getattr(client_ws, "request", None)
            if request and hasattr(request, "headers"):
                waybeo_headers = {k: v for k, v in request.headers.raw_items()}
    except Exception as e:
        if cfg.DEBUG:
            print(f"[telephony] ⚠️ Failed to capture WS headers: {e}")

    if waybeo_headers:
        print(f"[telephony] 📋 Waybeo headers received:")
        for hdr_key, hdr_val in waybeo_headers.items():
            # Mask auth tokens for security, show everything else
            if "auth" in hdr_key.lower() or "token" in hdr_key.lower():
                print(f"[telephony]   {hdr_key}: {hdr_val[:20]}...***")
            else:
                print(f"[telephony]   {hdr_key}: {hdr_val}")

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
        start_time=datetime.now(timezone.utc),
        waybeo_headers=waybeo_headers if waybeo_headers else None,
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

        # Extract UCID - prioritize start event, then Waybeo headers
        session.ucid = (
            start_msg.get("ucid")
            or start_msg.get("start", {}).get("ucid")
            or start_msg.get("data", {}).get("ucid")
            or waybeo_headers.get("x-waybeo-ucid", "")
            or waybeo_headers.get("X-Waybeo-Ucid", "")
            or waybeo_headers.get("ucid", "")
            or "UNKNOWN"
        )

        # Extract customer_number from start event or Waybeo headers
        session.customer_number = (
            start_msg.get("customer_number")
            or start_msg.get("data", {}).get("customer_number")
            or start_msg.get("caller_number")
            or start_msg.get("data", {}).get("caller_number")
            or waybeo_headers.get("x-waybeo-caller-number", "")
            or waybeo_headers.get("X-Waybeo-Caller-Number", "")
            or waybeo_headers.get("caller_number", "")
            or None
        )

        # Extract store_code from start event or Waybeo headers
        session.store_code = (
            start_msg.get("store_code")
            or start_msg.get("data", {}).get("store_code")
            or waybeo_headers.get("x-waybeo-store-code", "")
            or waybeo_headers.get("X-Waybeo-Store-Code", "")
            or waybeo_headers.get("store_code", "")
            or None
        )

        if cfg.LOG_TRANSCRIPTS:
            print(f"[{_ist_str()}] [{session.ucid}] 🎬 start event received on path={path}")
            if session.customer_number:
                print(f"[{_ist_str()}] [{session.ucid}] 📱 Customer number: {session.customer_number}")
            if session.store_code:
                print(f"[{session.ucid}] 🏪 Store code: {session.store_code}")

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
                
                # If we haven't sent hangup yet, send it now as a fallback
                if not session.hangup_sent:
                    session.hangup_sent = True
                    reason = "Call ended by telephony provider"
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 📞 Fallback hangup (stop event)")
                    # Note: Don't await here to avoid blocking, and stop event means
                    # the call is already ending on the telephony side
                
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

                # Audio chunk logging is too verbose - removed to keep logs clean
                # Transcripts still show what Gemini hears/says

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

    end_time = datetime.now(timezone.utc)
    duration_sec = int((end_time - session.start_time).total_seconds()) if session.start_time else 0

    print(f"[{_ist_str()}] [{session.ucid}] 💾 Saving call data ({len(session.conversation)} entries, {duration_sec}s)")

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
                "start_time": session.start_time.isoformat() if session.start_time else None,
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

        # Use Gemini 2.0 Flash for intelligent data extraction (no regex)
        cfg_instance = Config()
        if cfg_instance.GEMINI_API_KEY:
            print(f"[{session.ucid}] 🤖 Using Gemini 2.0 Flash for intelligent extraction...")
            extractor = GeminiExtractor(
                api_key=cfg_instance.GEMINI_API_KEY,
                model=cfg_instance.GEMINI_EXTRACT_MODEL,
            )
            gemini_extracted = await extractor.extract_data(
                conversation=transcript_conversation,
                agent_context=f"Agent: {session.agent}, Customer type: automotive",
            )
            response_data = build_response_data_from_extraction(
                gemini_extracted, transcript_conversation
            )
            extracted_data = build_extracted_map(response_data)
            print(f"[{session.ucid}] ✅ Gemini extraction complete: {gemini_extracted.get('extraction_notes', 'OK')}")
        else:
            # Fallback to regex extraction if no API key (not recommended)
            print(f"[{session.ucid}] ⚠️ No GEMINI_API_KEY, falling back to regex extraction")
            response_data = payload_builder.extract_response_data(transcript_conversation)
            extracted_data = payload_builder.build_extracted_map(response_data)

        completion_status = payload_builder.determine_completion_status(response_data)

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

        # Build template context for rendering payloads
        customer_name = payload_builder.customer_name
        si_template = None
        waybeo_template = None
        
        if agent_config:
            si_template = agent_config.get("siPayloadTemplate")
            waybeo_template = agent_config.get("waybeoPayloadTemplate")
            customer_name = agent_config.get("siCustomerName") or customer_name

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

        # Build template context with all available data
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
            "transfer_status": "not_transferred",
            "transfer_reason": "User decided",
            "response_data": response_data,
            "transcript": transcript_conversation,
            "transcript_text": transcript_text,
            "extracted": extracted_data,
            "analytics": analytics,
        }

        # Build SI payload - use template if available, otherwise use hardcoded builder
        if si_template:
            rendered_si = render_payload_template(si_template, template_context)
            if rendered_si.missing_placeholders:
                print(
                    f"[{session.ucid}] ⚠️ SI template missing values for: "
                    f"{', '.join(rendered_si.missing_placeholders)}"
                )
            si_payload = rendered_si.payload
        else:
            # Fallback to hardcoded payload builder
            si_payload = payload_builder.build_payload(
                conversation=transcript_conversation,
                start_time=transcript_start or session.start_time,
                end_time=transcript_end or end_time,
                duration_sec=transcript_duration,
            )

        # IMPORTANT: Always inject agent_slug for Admin UI VoiceAgent lookup
        # This ensures calls are linked to the correct VoiceAgent even if
        # the template doesn't include agent_slug
        if isinstance(si_payload, dict):
            si_payload["agent_slug"] = session.agent

        # The CLEAN SI payload (no extra Admin UI fields) - this is what gets sent to SI webhook
        si_webhook_payload = dict(si_payload) if isinstance(si_payload, dict) else si_payload

        # Save clean SI payload to local file
        storage.save_si_payload(session.ucid, si_webhook_payload)

        # Deliver to external webhooks if configured (before Admin UI push to capture responses)
        if agent_config:
            # SI webhook
            si_endpoint = agent_config.get("siEndpointUrl")
            si_auth = agent_config.get("siAuthHeader")
            if si_endpoint:
                print(f"[{session.ucid}] 📤 Delivering to SI webhook: {si_endpoint[:50]}...")
                si_result = await admin_client.push_to_si_webhook(
                    payload=si_webhook_payload,
                    endpoint_url=si_endpoint,
                    auth_header=si_auth,
                    call_id=session.ucid,
                )
                session.si_webhook_response = si_result

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
                
                # Store waybeo_payload in session for Admin UI (v0.6+)
                session.waybeo_payload = waybeo_payload
                
                print(f"[{session.ucid}] 📤 Delivering to Waybeo webhook: {waybeo_endpoint[:50]}...")
                waybeo_result = await admin_client.push_to_waybeo_webhook(
                    payload=waybeo_payload,
                    endpoint_url=waybeo_endpoint,
                    auth_header=waybeo_auth,
                    call_id=session.ucid,
                )
                session.waybeo_webhook_response = waybeo_result

        # Generate summary and sentiment using Gemini 2.0 Flash
        summary_data = {"summary": None, "sentiment": None, "sentimentScore": None}
        if cfg_instance.GEMINI_API_KEY and transcript_conversation:
            try:
                print(f"[{session.ucid}] 📝 Generating call summary & sentiment...")
                summary_data = await extractor.generate_summary_and_sentiment(
                    conversation=transcript_conversation,
                )
                if summary_data.get("summary"):
                    print(f"[{session.ucid}] ✅ Summary generated - sentiment: {summary_data.get('sentiment')}")
                else:
                    print(f"[{session.ucid}] ⚠️ Summary generation returned empty")
            except Exception as e:
                print(f"[{session.ucid}] ⚠️ Summary generation error: {e}")

        # Build Admin UI payload with extra tracking fields
        admin_payload = dict(si_webhook_payload) if isinstance(si_webhook_payload, dict) else {}
        admin_payload["waybeo_payload"] = session.waybeo_payload
        admin_payload["call_control_event"] = session.call_control_event
        # Store webhook responses for Admin UI display
        admin_payload["si_webhook_response"] = session.si_webhook_response
        admin_payload["waybeo_webhook_response"] = session.waybeo_webhook_response
        # Include Waybeo headers received at call start (for Admin UI display)
        admin_payload["waybeo_headers"] = session.waybeo_headers
        # Include transcript for Admin UI storage and display
        admin_payload["transcript"] = transcript_conversation
        # Include pre-generated summary and sentiment (avoids needing API key in admin-ui)
        admin_payload["summary"] = summary_data.get("summary")
        admin_payload["sentiment"] = summary_data.get("sentiment")
        admin_payload["sentimentScore"] = summary_data.get("sentimentScore")

        # Push to Admin UI database
        await admin_client.push_call_data(admin_payload, session.ucid)

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


