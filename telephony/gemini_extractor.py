"""
Intelligent data extraction using Gemini 2.0 Flash API.

Replaces regex-based extraction with AI-powered extraction for accurate
data capture from conversation transcripts.
"""

from __future__ import annotations

import json
import asyncio
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


EXTRACTION_PROMPT = """You are an AI assistant that extracts structured data from voice call transcripts.

Analyze the following conversation transcript and extract the requested information.
The conversation is between a voice AGENT and a CUSTOMER (user) inquiring about cars/vehicles.

TRANSCRIPT:
{transcript}

EXTRACT THE FOLLOWING DATA:
1. name - Customer's full name
2. model - Car model they are interested in (e.g., Seltos, EV9, Sonet, Nexon, etc.)
3. email - Customer's email address
4. test_drive - Whether they want a test drive (yes/no)
5. phone - Customer's phone number
6. location - Customer's city or location

CRITICAL EXTRACTION RULES:
- PRIORITIZE AGENT CONFIRMATIONS: The agent often corrects and confirms what the user said.
  When the agent says "So your name is Rohit, correct?" or "I'll note your email as rohit@gmail.com" - USE THE AGENT'S VERSION.
- Agent speech is more accurate than raw user speech (which may have transcription errors)
- For names: Look for agent confirmations like "your name is [X]", "thank you [X]", "[X] ji"
- For car models: Agent often confirms like "you're interested in [Model]", "for the [Model]"
- For email: Agent spells back the email for confirmation - USE THAT VERSION
- For test_drive: Look for user's "yes/haan/ji" or "no/nahi" responses, or agent confirmation
- If data is NOT mentioned or unclear even after checking agent speech, use null
- Respond ONLY with valid JSON, no explanations

EXAMPLE:
User: "mera naam ro... hit hai" (transcription error)
Agent: "Thank you Rohit ji, aap Seltos mein interested hain?"
→ Extract name as "Rohit" (from agent's clearer speech)

RESPONSE FORMAT (strict JSON):
{{
  "name": "extracted name or null",
  "model": "CAR MODEL IN UPPERCASE or null",
  "email": "email@example.com or null",
  "test_drive": "yes" or "no" or null,
  "phone": "phone number or null",
  "location": "city/location or null",
  "confidence": {{
    "name": 0.0-1.0,
    "model": 0.0-1.0,
    "email": 0.0-1.0,
    "test_drive": 0.0-1.0
  }},
  "extraction_notes": "brief note about extraction quality"
}}
"""


class GeminiExtractor:
    """
    Extracts structured data from conversation transcripts using Gemini 2.0 Flash.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def _format_transcript(self, conversation: List[Dict[str, Any]]) -> str:
        """Format conversation entries into readable transcript."""
        lines = []
        for entry in conversation:
            speaker = entry.get("speaker", "unknown").upper()
            text = entry.get("text", "")
            timestamp = entry.get("timestamp", "")
            if text.strip():
                lines.append(f"[{timestamp}] {speaker}: {text}")
        return "\n".join(lines)

    async def extract_data(
        self,
        conversation: List[Dict[str, Any]],
        agent_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract structured data from conversation using Gemini 2.0 Flash.

        Args:
            conversation: List of conversation entries with speaker, text, timestamp
            agent_context: Optional context about the agent/customer type

        Returns:
            Dictionary with extracted data and confidence scores
        """
        if not self.api_key:
            print("⚠️ GEMINI_API_KEY not configured, returning empty extraction")
            return self._empty_result("No API key configured")

        transcript_text = self._format_transcript(conversation)
        if not transcript_text.strip():
            return self._empty_result("Empty transcript")

        prompt = EXTRACTION_PROMPT.format(transcript=transcript_text)
        if agent_context:
            prompt = f"CONTEXT: {agent_context}\n\n{prompt}"

        try:
            # Run sync HTTP call in thread pool to not block event loop
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, self._call_gemini_api, prompt
            )
            return result
        except Exception as e:
            print(f"❌ Gemini extraction error: {e}")
            return self._empty_result(f"API error: {str(e)}")

    def _call_gemini_api(self, prompt: str) -> Dict[str, Any]:
        """Make synchronous API call to Gemini."""
        url = f"{self.api_url}?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,  # Low temperature for consistent extraction
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 1024,
            }
        }

        req = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(req, timeout=30) as response:
                response_data = json.loads(response.read().decode("utf-8"))

            # Extract text from Gemini response
            candidates = response_data.get("candidates", [])
            if not candidates:
                return self._empty_result("No candidates in response")

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return self._empty_result("No parts in response")

            text = parts[0].get("text", "")

            # Parse JSON from response
            # Handle markdown code blocks if present
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            extracted = json.loads(text.strip())
            extracted["_extraction_method"] = "gemini-2.0-flash"
            return extracted

        except HTTPError as e:
            error_body = e.read().decode("utf-8") if e.fp else ""
            print(f"❌ Gemini API HTTP error {e.code}: {error_body[:200]}")
            return self._empty_result(f"HTTP {e.code}")
        except URLError as e:
            print(f"❌ Gemini API URL error: {e.reason}")
            return self._empty_result(f"URL error: {e.reason}")
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse Gemini response as JSON: {e}")
            return self._empty_result("JSON parse error")

    def _empty_result(self, reason: str) -> Dict[str, Any]:
        """Return empty extraction result."""
        return {
            "name": None,
            "model": None,
            "email": None,
            "test_drive": None,
            "phone": None,
            "location": None,
            "confidence": {
                "name": 0.0,
                "model": 0.0,
                "email": 0.0,
                "test_drive": 0.0,
            },
            "extraction_notes": reason,
            "_extraction_method": "fallback",
        }


def build_response_data_from_extraction(
    extracted: Dict[str, Any],
    conversation: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Build SI-format response_data array from Gemini extraction results.

    Args:
        extracted: Dictionary from GeminiExtractor.extract_data()
        conversation: Original conversation for timing info

    Returns:
        List of response_data items in SI payload format
    """
    response_data = []

    # Define the fields to extract with their labels
    fields = [
        ("name", "What's your name"),
        ("model", "Which model you are looking for"),
        ("email", "What is your email id"),
        ("test_drive", "Do you want to schedule a test drive"),
        ("phone", "Phone number"),
    ]

    confidence = extracted.get("confidence", {})

    for key_value, key_label in fields:
        value = extracted.get(key_value)
        conf = confidence.get(key_value, 0.0)

        if value and str(value).strip() and str(value).lower() != "null":
            # Value was captured
            response_data.append({
                "key_label": key_label,
                "key_value": key_value,
                "key_response": str(value).strip(),
                "attempts": 1,
                "attempts_details": _find_timing_for_value(conversation, str(value)),
                "remarks": "verified",
                "_confidence": conf,
            })
        else:
            # Value not captured
            response_data.append({
                "key_label": key_label,
                "key_value": key_value,
                "key_response": " ",
                "attempts": 0,
                "attempts_details": [],
                "remarks": "not_captured",
                "_confidence": 0.0,
            })

    return response_data


def _find_timing_for_value(
    conversation: List[Dict[str, Any]],
    value: str,
) -> List[Dict[str, Any]]:
    """Find approximate timing for when a value was mentioned."""
    value_lower = value.lower()
    for i, entry in enumerate(conversation):
        if entry.get("speaker") == "user":
            text = (entry.get("text") or "").lower()
            if value_lower in text or any(word in text for word in value_lower.split()):
                timestamp = entry.get("timestamp", "")
                if timestamp:
                    # Parse ISO timestamp to formatted string
                    try:
                        from datetime import datetime
                        if "T" in timestamp:
                            dt = datetime.fromisoformat(timestamp.replace("Z", ""))
                            formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
                        else:
                            formatted = timestamp
                        
                        # Get end time from next entry if available
                        end_time = formatted
                        if i + 1 < len(conversation):
                            next_ts = conversation[i + 1].get("timestamp", "")
                            if next_ts and "T" in next_ts:
                                next_dt = datetime.fromisoformat(next_ts.replace("Z", ""))
                                end_time = next_dt.strftime("%Y-%m-%d %H:%M:%S")

                        return [{
                            "start_time": formatted,
                            "end_time": end_time,
                            "sequence": 1,
                        }]
                    except Exception:
                        pass
    return []


def build_extracted_map(response_data: List[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    """Build a simple key->value map from response_data for template rendering."""
    extracted: Dict[str, Optional[str]] = {}
    for item in response_data:
        key = item.get("key_value")
        if not key:
            continue
        raw_value = (item.get("key_response") or "").strip()
        extracted[key] = raw_value if raw_value and raw_value != " " else None
    return extracted
