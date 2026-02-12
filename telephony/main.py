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
import re
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
    # Waybeo call metadata from start event
    waybeo_headers: Optional[Dict[str, str]] = None
    vmn: Optional[str] = None  # Virtual Mobile Number (the Kia number the customer called)
    # Transfer/hangup state (set by Gemini 2.5 Live function calls)
    transfer_number: Optional[str] = None
    user_wants_transfer: Optional[bool] = None
    call_ending: bool = False
    hangup_sent: bool = False
    # Recent turn tracking (for transfer question validation)
    last_user_text: Optional[str] = None
    last_user_at: Optional[float] = None
    last_agent_text: Optional[str] = None
    transfer_question_asked_at: Optional[float] = None
    transfer_question_answered: bool = False
    last_transfer_answer_text: Optional[str] = None
    # Accumulates agent text within a single turn (reset at turnComplete)
    # Needed because Gemini sends transcription in small chunks
    current_turn_agent_text: str = ""
    # Call control event tracking (for Admin UI)
    call_control_event: Optional[Dict[str, Any]] = None
    waybeo_payload: Optional[Dict[str, Any]] = None
    # Webhook response tracking (for Admin UI display)
    si_webhook_response: Optional[Dict[str, Any]] = None
    waybeo_webhook_response: Optional[Dict[str, Any]] = None
    # Language enforcement state
    language_state: str = "hindi"            # Current expected language (hindi or english)
    current_turn_user_text: str = ""         # Accumulated user text for current turn
    language_correction_pending: bool = False # Set after mismatch injection


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


def _normalize_text(text: Optional[str]) -> str:
    """Normalize text for pattern matching: lowercase, strip, collapse whitespace."""
    if not text:
        return ""
    # Collapse multiple spaces into single space (handles accumulated chunks with double spaces)
    return re.sub(r'\s+', ' ', text.strip().lower())


def _is_affirmative(text: Optional[str]) -> bool:
    normalized = _normalize_text(text)
    return normalized in {
        "yes",
        "y",
        "yeah",
        "yep",
        "haan",
        "ha",
        "han",
        "ji",
        "haa",
        "bilkul",
        "haan ji",
    }


def _is_negative(text: Optional[str]) -> bool:
    normalized = _normalize_text(text)
    return normalized in {
        "no",
        "n",
        "nope",
        "nah",
        "nahi",
        "nahin",
        "nahi ji",
        "mat",
    }


def _is_explicit_transfer_request(text: Optional[str]) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    transfer_phrases = [
        "talk to a person",
        "talk to someone",
        "talk to sales",
        "talk to agent",
        "talk to dealer",
        "connect me to",
        "connect to dealer",
        "connect to sales",
        "speak to",
        "kisi se baat",
        "agent se baat",
        "dealer se baat",
        "sales team se baat",
        "insaan se baat",
        "baat karao",
        "baat karni hai",
    ]
    return any(phrase in normalized for phrase in transfer_phrases)


def _is_transfer_question(text: Optional[str]) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    return (
        "sales team" in normalized
        or "speak with our sales" in normalized
        or "sales team se baat" in normalized
        or "sales team se baat karna chahenge" in normalized
        or "sales team se baat karna chahenge?" in normalized
    )


def _is_goodbye_message(text: Optional[str]) -> bool:
    """
    Detect if the agent is saying a goodbye/sign-off message.

    Used as a safety-net to trigger hangup when Gemini forgets to call
    end_call() AND the transfer question was never properly detected.

    Only matches phrases that appear at call endings — NOT generic
    "thank you" that could appear mid-conversation.
    """
    if not text:
        return False
    normalized = text.lower().strip()
    goodbye_phrases = [
        "have a great day",
        "have a good day",
        "have a nice day",
        "din shubh ho",
        "aapka din shubh",
        "namaste aur dhanyawad",
        "call karne ke liye dhanyawad",
        "thank you for calling",
        "thanks for calling",
        "goodbye",
        "good bye",
        "alvida",
    ]
    return any(phrase in normalized for phrase in goodbye_phrases)


# ────────────────────────────────────────────────────────────────────────────
# Runtime Language Detection & Enforcement
# ────────────────────────────────────────────────────────────────────────────
# Prompt-based language lock is NOT sufficient for Gemini Live Audio because
# the model uses audio context (accent/prosody) to decide output language.
# This runtime layer detects language mismatches and injects corrections.
# ────────────────────────────────────────────────────────────────────────────

# Common Hindi words in Latin script (Romanized Hindi)
_HINDI_WORDS = frozenset({
    "mein", "hai", "hain", "ho", "hoon", "hun", "tha", "thi",
    "kya", "aur", "nahi", "haan", "ji", "naa",
    "chahiye", "chahenge", "chahte", "chahti",
    "karni", "karna", "karte", "karti", "karo",
    "batao", "bata", "batana", "bataye",
    "mujhe", "humko", "hamein", "unko",
    "humare", "aapka", "aapke", "aapki", "tumhara",
    "toh", "theek", "accha", "bahut",
    "abhi", "kal", "aaj", "parso",
    "dena", "denge", "dijiye",
    "lena", "lenge", "lijiye",
    "suno", "suniye", "dekho", "dekhiye",
    "apna", "apni", "apne",
    "yeh", "woh", "koi", "kuch",
    "lekin", "ya", "phir", "agar",
    "dhanyawad", "shukriya", "namaste",
    "baat", "gaadi", "paisa", "naam",
    "ka", "ki", "ke", "ko", "se", "pe", "par", "tak",
    "mera", "teri", "uska", "uski",
    "kaisa", "kaisi", "kaise", "kitna", "kitni",
    "jaldi", "dhire", "achha",
    "swagat", "madad", "sakti", "sakta",
})


def _is_data_response(text: str) -> bool:
    """
    Detect if text is a data-point response (name, yes/no, date/time,
    car model, address, email).  These should NEVER trigger a language
    switch, even if they exceed the 4-word threshold.
    """
    tl = text.lower().strip()
    if not tl:
        return False

    # ── 1. Yes/No / affirmative / negative responses ──
    # "yes", "yeah day after tomorrow", "no thanks", "sure why not"
    _YES_NO_STARTS = (
        "yes", "no", "yeah", "yep", "nah", "ok", "okay", "sure",
        "haan", "nahi", "nahin", "ji", "bilkul", "theek", "hmm",
        "accha", "right",
    )
    for prefix in _YES_NO_STARTS:
        if tl == prefix or tl.startswith(prefix + " ") or tl.startswith(prefix + ","):
            return True

    # ── 2. Name-giving phrases ──
    # "My name is Rohit Sharma", "I am Rohit", "naam Rohit hai"
    _NAME_PATTERNS = (
        "my name is", "my name's", "i am ", "i'm ", "this is ",
        "naam ", "mera naam", "it's ", "call me ",
    )
    for p in _NAME_PATTERNS:
        if p in tl:
            return True

    # ── 3. Date/time responses (test-drive scheduling) ──
    # "day after tomorrow", "next Monday", "this Saturday"
    _DATE_WORDS = {
        "tomorrow", "today", "yesterday",
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
        "kal", "aaj", "parso",
        "next week", "this week", "day after",
    }
    for dw in _DATE_WORDS:
        if dw in tl:
            return True

    # ── 4. Address / location indicators ──
    # "42 MG Road Koramangala Bangalore"
    _ADDR_WORDS = {
        "road", "street", "nagar", "colony", "sector", "marg",
        "lane", "avenue", "block", "phase", "floor", "flat",
        "building", "chowk", "bazaar", "market", "pin code",
        "pincode", "area",
    }
    for aw in _ADDR_WORDS:
        if aw in tl:
            return True

    # ── 5. Phone number responses ──
    # "9876543210", "my number is 9876543210"
    digits = sum(1 for c in tl if c.isdigit())
    if digits >= 7:  # Likely a phone number
        return True

    return False


def _detect_language(text: str) -> tuple:
    """
    Detect language and category from transcription text.
    Returns (language, category):
      ("hindi", "A"|"B"), ("english", "A"|"B"), ("unknown", "A")

    Category A: Names, single words, car models, emails, data responses
               — do NOT change language state.
    Category B: Full conversational sentence (4+ meaningful words,
               NOT a data response) — CHANGES language state.
    """
    if not text or not text.strip():
        return ("unknown", "A")

    # ── Always Category A: emails, phone numbers, single-word items ──
    # Emails contain @ or common domain fragments — NEVER switch language for them
    text_lower = text.lower()
    if "@" in text or any(d in text_lower for d in [
        "gmail", "yahoo", "hotmail", "outlook", ".com", ".in", ".co"
    ]):
        return ("unknown", "A")

    # ── Always Category A: data-point responses ──
    # Names, yes/no, dates, addresses, car models — these are answers
    # to data-collection questions, NOT language switches.
    if _is_data_response(text):
        return ("unknown", "A")

    # Check for Devanagari script → likely Hindi
    has_devanagari = any("\u0900" <= c <= "\u097F" for c in text)

    # Split into meaningful words (filter single chars & punctuation)
    words = [w.strip(".,!?;:\"'()@") for w in text.split()]
    meaningful = [w for w in words if len(w) > 1]

    if has_devanagari:
        # Even with Devanagari, require 4+ meaningful words that are NOT
        # just a name/email (which may be transcribed in Devanagari).
        if len(meaningful) < 4:
            return ("hindi", "A")
        # Check if it looks like a sentence (has verb-like Hindi words)
        has_sentence_words = any(
            w in _HINDI_WORDS
            for w in (w.strip(".,!?;:\"'()") for w in text.split())
            if len(w) > 2
        )
        return ("hindi", "B") if has_sentence_words else ("hindi", "A")

    # All Latin script — check word count for category
    if len(meaningful) < 4:
        return ("unknown", "A")  # Too short → Category A (names, models, etc.)

    # Count Hindi words in Romanized text
    hindi_count = sum(1 for w in meaningful if w.lower() in _HINDI_WORDS)
    hindi_ratio = hindi_count / max(len(meaningful), 1)

    if hindi_ratio >= 0.25 or hindi_count >= 3:
        return ("hindi", "B")
    else:
        return ("english", "B")


def _detect_agent_language(text: str) -> str:
    """Detect which language the agent is speaking from accumulated turn text."""
    if not text or not text.strip():
        return "unknown"

    words = [w.strip(".,!?;:\"'()").lower() for w in text.split() if len(w.strip(".,!?;:\"'()")) > 1]
    if not words:
        return "unknown"

    hindi_count = sum(1 for w in words if w in _HINDI_WORDS)
    total = len(words)

    if total == 0:
        return "unknown"

    # If 20%+ of agent's words are Hindi → speaking Hindi
    if hindi_count / total >= 0.20:
        return "hindi"
    return "english"


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


async def send_transfer_event(session: TelephonySession, transfer_number: Optional[str], cfg: "Config") -> bool:
    """
    Send transfer command to Waybeo via HTTP API.
    
    Uses Waybeo's bot-call HTTP endpoint (same as singleinterface).
    WebSocket stays open - Waybeo closes it after transfer completes.
    
    Args:
        session: Current telephony session
        transfer_number: Optional phone number (legacy WS fallback only)
        cfg: Config instance
        
    Returns:
        True if event sent successfully
    """
    try:
        # Primary: Use Waybeo HTTP API (correct protocol)
        api_success = await _waybeo_api_command(session, "transfer_call", cfg)
        
        if api_success:
            print(f"[{_ist_str()}] [{session.ucid}] 📞 Transfer sent via Waybeo API")
            return True
        
        # Fallback: Send WebSocket event (legacy, may not work). Requires number.
        if transfer_number:
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

        print(f"[{session.ucid}] ⚠️ Waybeo API failed and no transfer number configured for WS fallback")
        return False
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
        
        # Give Waybeo time to process the hangup command before closing WS.
        # If we close WS immediately, Waybeo may not have finished
        # disconnecting the phone line, and the caller stays connected.
        await asyncio.sleep(1.0)
        
        # Close the WebSocket connection as final cleanup
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

# Module-level cache for agent config (includes VMN mappings, prompt, webhook endpoints)
_agent_config_cache: Dict[str, Dict[str, Any]] = {}


def _fetch_agent_config_from_api(agent: str) -> Optional[Dict[str, Any]]:
    """
    Fetch full agent config from Admin UI API (includes VMN mappings).
    Caches result for the session lifetime.
    Returns None if API is unavailable or agent not found.
    """
    import urllib.request
    import urllib.error
    
    # Return cached config if available
    agent_lower = agent.lower()
    if agent_lower in _agent_config_cache:
        return _agent_config_cache[agent_lower]
    
    url = f"{ADMIN_API_BASE}/api/telephony/prompt/{agent_lower}"
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                _agent_config_cache[agent_lower] = data
                return data
    except urllib.error.HTTPError as e:
        print(f"[telephony] ⚠️ API error for {agent}: HTTP {e.code}")
    except Exception as e:
        print(f"[telephony] ⚠️ API unavailable for {agent}: {e}")
    return None


def _fetch_prompt_from_api(agent: str) -> Optional[str]:
    """
    Fetch system instructions from Admin UI API and augment with knowledge pool.
    Returns None if API is unavailable or agent not found.
    """
    config = _fetch_agent_config_from_api(agent)
    if config:
        instructions = config.get("systemInstructions", "")
        if instructions and instructions.strip():
            print(f"[telephony] ✅ Loaded prompt from API for agent: {agent}")
            vmn_count = len(config.get("vmnMappings", {}))
            if vmn_count > 0:
                print(f"[telephony] 📞 VMN mappings loaded: {vmn_count} entries")
            
            # Augment with knowledge pool if available
            try:
                from knowledge_pool import KnowledgePool
                admin_url = cfg_instance.ADMIN_URL if cfg_instance else "http://localhost:3100"
                knowledge = KnowledgePool(admin_url=admin_url, agent_slug=agent)
                stats = knowledge.get_stats()
                
                if stats.get("total_corrections", 0) > 0:
                    instructions = knowledge.augment_system_instructions(
                        base_instructions=instructions,
                        fields=["name", "model", "email", "test_drive"]
                    )
                    print(f"[telephony] 🧠 Knowledge pool augmented with {stats['total_corrections']} corrections")
                else:
                    print(f"[telephony] 💡 Knowledge pool empty - no corrections yet")
            except Exception as e:
                print(f"[telephony] ⚠️ Knowledge pool unavailable: {e}")
                # Continue with base instructions if knowledge pool fails
            
            return instructions
    return None


def _lookup_store_code_by_vmn(agent: str, vmn: Optional[str]) -> Optional[str]:
    """
    Look up store code from VMN using the agent's VMN→StoreCode mapping.
    
    Args:
        agent: Agent slug (e.g., "spotlight")
        vmn: Virtual Mobile Number from Waybeo start event
        
    Returns:
        Store code string or None if no mapping found
    """
    if not vmn:
        return None
    
    config = _fetch_agent_config_from_api(agent)
    if not config:
        return None
    
    vmn_mappings = config.get("vmnMappings", {})
    if not vmn_mappings:
        return None
    
    # Direct lookup
    store_code = vmn_mappings.get(vmn)
    if store_code:
        print(f"[telephony] 🏪 VMN {vmn} → Store Code: {store_code}")
        return store_code
    
    # Try with/without + prefix
    if vmn.startswith("+"):
        store_code = vmn_mappings.get(vmn[1:])
    else:
        store_code = vmn_mappings.get(f"+{vmn}")
    
    if store_code:
        print(f"[telephony] 🏪 VMN {vmn} → Store Code: {store_code}")
        return store_code
    
    print(f"[telephony] ⚠️ No store code mapping found for VMN: {vmn}")
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

                # ── Block function calls during language correction ──
                # When we inject a language hint, Gemini sometimes interprets
                # it as needing to call transfer_call().  Silently absorb the
                # call and tell Gemini to continue the conversation normally.
                if session.language_correction_pending:
                    print(
                        f"[{session.ucid}] ⚠️ Ignoring {func_name}() during language correction"
                    )
                    try:
                        await session.gemini.send_function_response(
                            call_id=func_id,
                            func_name=func_name,
                            response={
                                "status": "ignored",
                                "note": "Continue the conversation. Do not transfer or end the call. Re-ask your last question in the correct language.",
                            },
                        )
                    except Exception:
                        pass
                    continue

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
                    continue

                async def _reject_call(message: str, redirect: str = "") -> None:
                    """Reject a Gemini function call with explicit redirect instructions.
                    
                    The redirect message tells Gemini exactly what to do next,
                    preventing it from saying "I'll connect you to Sales Team"
                    after a rejected transfer_call().
                    """
                    print(f"[{session.ucid}] ⚠️ REJECTED {func_name}() - {message}")
                    # Build response with explicit redirect so Gemini doesn't go off-script
                    rejection_response: Dict[str, Any] = {"error": message}
                    if redirect:
                        rejection_response["instruction"] = redirect
                    try:
                        await session.gemini.send_function_response(
                            call_id=func_id,
                            func_name=func_name,
                            response=rejection_response,
                        )
                    except Exception as e:
                        print(f"[{session.ucid}] ⚠️ Failed to send function rejection: {e}")
                
                if func_name == "transfer_call":
                    allow_transfer = False

                    # Debug: log exact state for transfer validation
                    print(
                        f"[{session.ucid}] 🔍 Transfer validation: "
                        f"last_user='{session.last_user_text}', "
                        f"q_asked={session.transfer_question_asked_at is not None}, "
                        f"q_answered={session.transfer_question_answered}, "
                        f"answer_text='{session.last_transfer_answer_text}', "
                        f"turn_user='{(session.current_turn_user_text or '').strip()[:50]}'"
                    )

                    if _is_explicit_transfer_request(session.last_user_text):
                        allow_transfer = True
                    elif (
                        session.transfer_question_asked_at
                        and session.transfer_question_answered
                    ):
                        # Gemini already heard the audio and decided the user
                        # wants to transfer.  Trust Gemini's decision UNLESS
                        # the transcribed answer is explicitly negative.
                        if _is_negative(session.last_transfer_answer_text):
                            # User said "no" — reject the transfer
                            pass
                        else:
                            # User said yes / affirmative / unclear → trust Gemini
                            allow_transfer = True

                    if not allow_transfer:
                        await _reject_call(
                            "TRANSFER DENIED. You have NOT completed the required steps.",
                            redirect=(
                                "Do NOT transfer. Do NOT mention Sales Team. Do NOT say 'connect'. "
                                "Continue the NORMAL conversation flow: "
                                "1) Ask customer's NAME first, 2) Ask car MODEL, "
                                "3) Ask about TEST DRIVE, 4) Ask for EMAIL. "
                                "Respond to the customer's last message naturally."
                            ),
                        )
                        continue

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
                    # Trust Gemini's end_call decision if the transfer question
                    # was asked and the user responded. Gemini heard the actual
                    # audio and may understand "no" even when transcription is
                    # garbled (e.g. "nahi" → "आईं"). Only reject if:
                    #   - Call is too short (already handled above)
                    #   - Transfer question was never asked AND call < 60s
                    allow_end = True
                    if not session.transfer_question_asked_at and call_duration < 60:
                        allow_end = False
                    
                    if not allow_end:
                        await _reject_call(
                            "END CALL DENIED. Conversation is not complete yet.",
                            redirect=(
                                "Do NOT end the call. Do NOT say goodbye. "
                                "Continue collecting data from the customer. "
                                "You still need to ask the Sales Team transfer question. "
                                "Respond to the customer's last message naturally."
                            ),
                        )
                        continue

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
            if server_content.get("turnComplete") and not session.hangup_sent:
                # ── Language correction response handling — MUST be first ──
                # If this turnComplete is from Gemini's response to our
                # language injection, just reset flags and move on.
                # We MUST check this BEFORE transfer-question detection,
                # because the correction response may mention "Sales Team"
                # and we don't want that to falsely set transfer_question_asked_at.
                if session.language_correction_pending:
                    session.language_correction_pending = False
                    session.current_turn_agent_text = ""
                    session.current_turn_user_text = ""
                    continue

                # ── Check accumulated agent text for transfer question ──
                # Gemini sends transcription in small chunks (e.g. "Sales",
                # "Team", "se baat", "chahenge?"). Individual chunks never
                # contain the full phrase, so we accumulate per-turn and
                # check the full sentence at turnComplete.
                if session.current_turn_agent_text.strip():
                    full_turn_text = session.current_turn_agent_text.strip()
                    if _is_transfer_question(full_turn_text):
                        print(
                            f"[{session.ucid}] 📋 Transfer question detected in turn: "
                            f"'{full_turn_text[:60]}...'"
                        )
                        session.transfer_question_asked_at = time.time()
                        session.transfer_question_answered = False
                        session.last_transfer_answer_text = None

                # ── Language enforcement at turn boundary ──
                # Detect if agent's language matches expected state.
                # If user spoke English but agent replied in Hindi,
                # inject a corrective text context so Gemini adjusts.
                if (
                    session.current_turn_agent_text.strip()
                    and not session.call_ending
                    and not session.hangup_sent
                ):
                    agent_lang = _detect_agent_language(session.current_turn_agent_text)
                    user_text = session.current_turn_user_text.strip()
                    user_lang, user_cat = _detect_language(user_text) if user_text else ("unknown", "A")

                    # Update language state on Category B user utterance
                    if user_cat == "B" and user_lang in ("hindi", "english"):
                        if session.language_state != user_lang:
                            print(
                                f"[{session.ucid}] 🌐 Language state: "
                                f"{session.language_state} → {user_lang} "
                                f"(Category B: '{user_text[:50]}')"
                            )
                        session.language_state = user_lang

                    # Check for mismatch: agent spoke wrong language
                    if (
                        agent_lang != "unknown"
                        and session.language_state != agent_lang
                    ):
                        print(
                            f"[{session.ucid}] ⚠️ Language mismatch! "
                            f"Expected={session.language_state}, "
                            f"Agent spoke={agent_lang}. Injecting correction."
                        )
                        session.language_correction_pending = True
                        # NOTE: Do NOT suppress audio. Gemini re-generates the question
                        # in the correct language, and that audio SHOULD be played.
                        # Buffer clearing (on interrupted event) already stops the
                        # wrong-language audio mid-sentence.
                        try:
                            await session.gemini.inject_language_context(
                                session.language_state
                            )
                        except Exception as e:
                            print(f"[{session.ucid}] ⚠️ Language injection failed: {e}")
                            session.language_correction_pending = False
                        # Reset text and skip call-end logic for this turn
                        session.current_turn_agent_text = ""
                        session.current_turn_user_text = ""
                        continue

                # Grab accumulated turn text before reset (needed for goodbye check)
                _turn_agent_text = session.current_turn_agent_text.strip()

                # Reset accumulated text for next turn
                session.current_turn_agent_text = ""
                session.current_turn_user_text = ""

                call_age = time.time() - session.call_start_time

                if session.call_ending:
                    # Normal path: Gemini called end_call/transfer_call, goodbye done
                    print(f"[{session.ucid}] ✅ Goodbye message complete - triggering call end")
                    # Set hangup_sent IMMEDIATELY to prevent duplicate tasks
                    # (audio drain wait inside _handle_call_end is async)
                    session.hangup_sent = True
                    asyncio.create_task(_handle_call_end(session, cfg))
                elif (
                    session.transfer_question_asked_at
                    and session.transfer_question_answered
                ):
                    # Safety net A: Transfer question was asked AND user responded,
                    # but Gemini said goodbye without calling end_call().
                    # This is state-based (not text matching) — the transfer
                    # question is always the final step, so if user answered and
                    # agent finished speaking, the call is done.
                    print(
                        f"[{session.ucid}] 🔄 Auto-hangup: transfer question answered "
                        f"but Gemini didn't call end_call() — triggering hangup"
                    )
                    session.user_wants_transfer = False
                    session.call_ending = True
                    # Set hangup_sent IMMEDIATELY to prevent duplicate tasks
                    session.hangup_sent = True
                    asyncio.create_task(_handle_call_end(session, cfg))
                elif call_age > 30 and _is_goodbye_message(_turn_agent_text):
                    # Safety net B: Goodbye detection.
                    # Agent said a clear goodbye phrase (e.g. "Have a great day!")
                    # but Gemini didn't call end_call() AND the transfer question
                    # was never detected. This can happen when:
                    #   - Language correction confused the flow
                    #   - Gemini skipped the transfer question
                    #   - Transfer question phrasing wasn't detected
                    # Only triggers after 30s to avoid false positives on greetings.
                    print(
                        f"[{session.ucid}] 🔄 Goodbye detected — triggering hangup "
                        f"(agent: '{_turn_agent_text[:60]}...', call_age={call_age:.0f}s)"
                    )
                    session.user_wants_transfer = False
                    session.call_ending = True
                    session.hangup_sent = True
                    asyncio.create_task(_handle_call_end(session, cfg))

            # Capture transcription if present
            transcription = _extract_transcription(msg, debug=cfg.DEBUG)
            if transcription:
                session.conversation.append(transcription)
                speaker = transcription["speaker"]
                text = transcription.get("text", "")

                if speaker == "user":
                    session.last_user_text = text
                    session.last_user_at = time.time()
                    # Accumulate user text for language detection at turnComplete
                    session.current_turn_user_text += " " + text
                    if session.transfer_question_asked_at and not session.transfer_question_answered:
                        session.transfer_question_answered = True
                        session.last_transfer_answer_text = text
                elif speaker == "agent":
                    session.last_agent_text = text
                    # Accumulate agent text within the current turn.
                    # Transfer question detection happens at turnComplete
                    # using the full accumulated text (not individual chunks).
                    session.current_turn_agent_text += " " + text
                
                # Always log transcripts (these are valuable)
                if cfg.LOG_TRANSCRIPTS:
                    display_text = text[:80] + "..." if len(text) > 80 else text
                    print(f"[{session.ucid}] 📝 {speaker}: {display_text}")

            audio_b64 = _extract_audio_b64_from_gemini_message(msg)
            if not audio_b64:
                continue

            # Skip audio if Gemini is acknowledging language correction
            # (e.g., "[Acknowledged. The customer is speaking Hindi...]")
            if session.language_correction_pending:
                agent_text_so_far = session.current_turn_agent_text.strip().lower()
                # Detect acknowledgment phrases
                ack_patterns = [
                    "[acknowledged",
                    "acknowledged.",
                    "the customer is speaking",
                    "i will respond in",
                ]
                if any(pattern in agent_text_so_far for pattern in ack_patterns):
                    # Skip this audio chunk - it's the acknowledgment, not the re-asked question
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 🔇 Skipping acknowledgment audio during language correction")
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
    finally:
        print(f"[{session.ucid}] ⚠️ Gemini reader exited (conversation entries: {len(session.conversation)})")


async def _handle_call_end(session: TelephonySession, cfg: Config) -> None:
    """
    Handle end of call - send transfer or hangup event to telephony provider.
    
    Called when agent says goodbye. Waits for audio to finish playing,
    then sends the appropriate event:
    - Transfer if user said YES to talking to sales team
    - Hangup if user said NO or didn't respond
    
    NOTE: session.hangup_sent is set BEFORE this task is created (at the call
    site) to prevent duplicate tasks from race conditions with turnComplete events.
    """
    try:
        # Wait for output buffer to drain so goodbye audio plays
        # Check every 100ms, timeout after 5 seconds
        wait_time = 0
        while len(session.output_buffer) > 0 and wait_time < 5.0:
            await asyncio.sleep(0.1)
            wait_time += 0.1
        
        # Extra 500ms to ensure audio is fully delivered to caller's phone
        await asyncio.sleep(0.5)
        
        event_timestamp = _now_ist().isoformat()
        
        if session.user_wants_transfer:
            # User wants to talk to a sales agent - send transfer event
            # Waybeo transfer_call uses only UCID; number is not required
            transfer_number = session.transfer_number or os.getenv("DEFAULT_TRANSFER_NUMBER", "")
            print(f"[{session.ucid}] 📞 User requested transfer → calling Waybeo transfer API")
            transfer_ok = await send_transfer_event(session, transfer_number or None, cfg)
            session.call_control_event = {
                "type": "transfer",
                "reason": "User requested to speak with sales agent",
                "timestamp": event_timestamp,
                "status": "sent" if transfer_ok else "failed",
                "transfer_number": transfer_number or None,
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
        temperature=0.5,  # Low temperature for stricter rule-following (language, tone)
        enable_affective_dialog=False,  # Disabled: prevent excited/emotional voice variations
        enable_input_transcription=True,   # Enable for transcript capture
        enable_output_transcription=True,  # Enable for transcript capture
        vad_silence_ms=300,   # Less aggressive to reduce dropped turns
        vad_prefix_ms=200,    # Slightly higher prefix for stability
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

        # Log start event body for debugging (shows all data Waybeo sends)
        if cfg.DEBUG:
            # Log keys and small values, skip large binary data
            safe_start = {k: (v if not isinstance(v, (list, bytes)) or len(str(v)) < 200 else f"<{type(v).__name__}:{len(v)}>") for k, v in start_msg.items()}
            print(f"[telephony] 📦 Start event payload: {json.dumps(safe_start, default=str)}")

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

        # Extract customer_number from start event (Waybeo sends it as "did")
        session.customer_number = (
            start_msg.get("did")  # Waybeo sends customer number in "did" field
            or start_msg.get("customer_number")
            or start_msg.get("caller_number")
            or start_msg.get("customerId")
            or start_msg.get("From")
            or start_msg.get("customer_mobile")
            or start_msg.get("data", {}).get("did")
            or start_msg.get("data", {}).get("customer_number")
            or start_msg.get("data", {}).get("caller_number")
            or start_msg.get("start", {}).get("did")
            or waybeo_headers.get("x-waybeo-caller-number", "")
            or waybeo_headers.get("X-Waybeo-Caller-Number", "")
            or None
        )

        # Extract VMN (Virtual Mobile Number - the Kia number the customer dialed)
        session.vmn = (
            start_msg.get("vmn")
            or start_msg.get("data", {}).get("vmn")
            or start_msg.get("start", {}).get("vmn")
            or None
        )

        # Extract store_code: Priority order:
        # 1. VMN→StoreCode mapping from Admin UI (most reliable)
        # 2. Explicit store_code in start event
        # 3. Waybeo headers (legacy)
        vmn_store_code = _lookup_store_code_by_vmn(agent, session.vmn)
        session.store_code = (
            vmn_store_code
            or start_msg.get("store_code")
            or start_msg.get("data", {}).get("store_code")
            or waybeo_headers.get("x-waybeo-store-code", "")
            or waybeo_headers.get("X-Waybeo-Store-Code", "")
            or waybeo_headers.get("store_code", "")
            or "1001"  # Default store code when VMN not in mapping
        )

        # Update waybeo_headers to include start event data for Admin UI display
        # The start event body contains the actual call data (ucid, did, vmn)
        # while WS headers only have transport info (Upgrade, Connection, etc.)
        session.waybeo_headers = {
            "start_event": start_msg,  # Actual call data from Waybeo
            "ws_headers": waybeo_headers if waybeo_headers else {},  # WebSocket HTTP headers
        }

        if cfg.LOG_TRANSCRIPTS:
            print(f"[{_ist_str()}] [{session.ucid}] 🎬 start event received on path={path}")
            if session.customer_number:
                print(f"[{_ist_str()}] [{session.ucid}] 📱 Customer (DID): {session.customer_number}")
            if session.vmn:
                print(f"[{_ist_str()}] [{session.ucid}] 📞 VMN (Kia number): {session.vmn}")
            if session.store_code:
                src = "VMN mapping" if vmn_store_code else "start event"
                print(f"[{_ist_str()}] [{session.ucid}] 🏪 Store code: {session.store_code} (from {src})")

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

        print(f"[{session.ucid}] 📞 Main WS loop ended (normal exit)")
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
    except ConnectionClosed as e:
        # Save data even on connection close
        print(f"[{session.ucid}] 📞 Waybeo WS closed: code={e.code}, reason={e.reason}")
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

    end_time_utc = datetime.now(timezone.utc)
    duration_sec = int((end_time_utc - session.start_time).total_seconds()) if session.start_time else 0
    # Convert to IST for all payload timestamps (payloads should always use IST)
    end_time = end_time_utc.astimezone(IST)
    start_time_ist = session.start_time.astimezone(IST) if session.start_time else end_time

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
                "start_time": start_time_ist.isoformat(),
                "end_time": end_time.isoformat(),
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
        # Ensure all timestamps are in IST for payload consistency
        ctx_start = transcript_start or start_time_ist
        ctx_end = transcript_end or end_time
        # If parsed datetimes are naive (no tz info), assume IST; if UTC, convert
        if ctx_start and ctx_start.tzinfo is None:
            ctx_start = ctx_start.replace(tzinfo=IST)
        elif ctx_start and ctx_start.tzinfo == timezone.utc:
            ctx_start = ctx_start.astimezone(IST)
        if ctx_end and ctx_end.tzinfo is None:
            ctx_end = ctx_end.replace(tzinfo=IST)
        elif ctx_end and ctx_end.tzinfo == timezone.utc:
            ctx_end = ctx_end.astimezone(IST)

        # Build extracted data with attempts/attempts_details/remarks for template rendering
        # Extract from response_data for each field
        def get_field_data(key_value: str):
            """Extract attempts, attempts_details, remarks for a given key_value from response_data."""
            item = next((r for r in response_data if r.get("key_value") == key_value), None)
            if item:
                return {
                    f"{key_value}_attempts": item.get("attempts", 0),
                    f"{key_value}_attempts_details": item.get("attempts_details", []),
                    f"{key_value}_remarks": item.get("remarks", "not_captured"),
                }
            return {
                f"{key_value}_attempts": 0,
                f"{key_value}_attempts_details": [],
                f"{key_value}_remarks": "not_captured",
            }
        
        # Merge all extracted field data
        extracted_with_metadata = {**extracted_data}
        for key in ["name", "model", "email", "test_drive"]:
            extracted_with_metadata.update(get_field_data(key))
        
        template_context = {
            "call_id": session.ucid,
            "agent_slug": session.agent,
            "agent_name": agent_config.get("name") if agent_config else session.agent,
            "customer_name": customer_name,
            "store_code": session.store_code or "",
            "customer_number": session.customer_number or "",
            "vmn": session.vmn or "",  # Virtual Mobile Number (Kia number dialed)
            "start_time": ctx_start.strftime("%Y-%m-%d %H:%M:%S") if ctx_start else "",
            "end_time": ctx_end.strftime("%Y-%m-%d %H:%M:%S") if ctx_end else "",
            "duration_sec": transcript_duration,
            "completion_status": completion_status,
            "detected_language": detected_language,
            "transfer_status": session.user_wants_transfer if session.user_wants_transfer is not None else False,
            "transfer_reason": "User decided" if not session.user_wants_transfer else "User requested",
            "response_data": response_data,
            "transcript": transcript_conversation,
            "transcript_text": transcript_text,
            "extracted": extracted_with_metadata,  # Now includes attempts/attempts_details/remarks
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
            # Fallback to hardcoded payload builder (always IST)
            si_payload = payload_builder.build_payload(
                conversation=transcript_conversation,
                start_time=ctx_start,
                end_time=ctx_end,
                duration_sec=transcript_duration,
            )

        # The CLEAN SI payload (exactly as rendered from template) - this is what gets sent to SI webhook
        # Do NOT inject extra fields like agent_slug here - that would alter the user's template
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
        # IMPORTANT: Inject agent_slug for Admin UI VoiceAgent lookup
        # This is ONLY for internal tracking - not included in SI webhook payload
        admin_payload["agent_slug"] = session.agent
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


