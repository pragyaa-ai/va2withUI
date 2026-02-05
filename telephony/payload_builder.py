"""
Webhook payload builder for VoiceAgent.

Constructs webhook payloads from conversation transcripts in SI format:
{
    "id": "bot_...",
    "call_ref_id": "...",
    "customer_name": "CustomerName",
    "store_code": "STORE001",
    "start_time": "2026-01-31 13:36:41",
    "end_time": "2026-01-31 13:38:00",
    "duration": 79,
    "completion_status": "partial",
    "response_data": [
        {"key_value": "name", "key_response": "John", ...},
        {"key_value": "interest", "key_response": "Product A", ...},
    ]
}
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# Key patterns to extract from conversation
# Maps key_value to (label, regex patterns for extraction)
EXTRACTION_PATTERNS: Dict[str, Tuple[str, List[str]]] = {
    "name": (
        "What's your name",
        [
            r"(?:my name is|i am|this is|i'm)\s+([A-Za-z\s]+)",
            r"(?:name|naam)[:\s]+([A-Za-z\s]+)",
        ],
    ),
    "interest": (
        "What are you interested in",
        [
            r"(?:interested in|looking for|want|need)\s+(?:the\s+)?([A-Za-z0-9\s]+?)(?:\s+(?:service|product))?(?:\.|,|$)",
        ],
    ),
    "email": (
        "What is your email",
        [
            r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        ],
    ),
    "callback": (
        "Would you like a callback",
        [
            r"(?:yes|sure|ok|definitely|please)",
            r"(?:no|not|nope|later)",
        ],
    ),
    "phone": (
        "Phone number",
        [
            r"(?:\+\d{1,3})?[\d\s-]{10,}",
        ],
    ),
}


class SIPayloadBuilder:
    """Builds webhook payloads from conversation data."""

    def __init__(
        self,
        agent: str,
        call_id: str,
        customer_number: Optional[str] = None,
        store_code: Optional[str] = None,
        customer_name: Optional[str] = None,
    ):
        self.agent = agent.lower()
        self.call_id = call_id
        self.customer_number = customer_number
        self.store_code = store_code
        # Use provided customer_name or derive from agent
        self.customer_name = customer_name or self.agent.replace("-", " ").title()

    def extract_response_data(
        self,
        conversation: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Extract key response data from conversation.

        Args:
            conversation: List of {timestamp, speaker, text} entries

        Returns:
            List of response_data items in SI format
        """
        response_data = []
        user_texts = [
            entry for entry in conversation if entry.get("speaker") == "user"
        ]

        # Combine all user text for pattern matching
        all_user_text = " ".join(entry.get("text", "") for entry in user_texts).lower()

        for key_value, (key_label, patterns) in EXTRACTION_PATTERNS.items():
            extracted = self._extract_value(all_user_text, patterns, key_value)

            if extracted:
                # Find timing from conversation
                timing = self._find_timing_for_key(conversation, extracted, key_value)

                response_data.append({
                    "key_label": key_label,
                    "key_value": key_value,
                    "key_response": extracted,
                    "attempts": 1,
                    "attempts_details": [timing] if timing else [],
                    "remarks": "verified" if extracted.strip() else "not_captured",
                })
            else:
                response_data.append({
                    "key_label": key_label,
                    "key_value": key_value,
                    "key_response": " ",
                    "attempts": 0,
                    "attempts_details": [],
                    "remarks": "not_captured",
                })

        return response_data

    def _extract_value(
        self,
        text: str,
        patterns: List[str],
        key_value: str,
    ) -> Optional[str]:
        """Extract value using patterns."""
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # For patterns with capture groups, return the group
                if match.groups():
                    return match.group(1).strip().title()
                # For simple patterns, return the match
                return match.group(0).strip()
        return None

    def _find_timing_for_key(
        self,
        conversation: List[Dict[str, Any]],
        value: str,
        key_value: str,
    ) -> Optional[Dict[str, Any]]:
        """Find approximate timing for when a value was captured."""
        value_lower = value.lower()
        for i, entry in enumerate(conversation):
            if entry.get("speaker") == "user" and value_lower in entry.get("text", "").lower():
                timestamp = entry.get("timestamp")
                if timestamp:
                    return {
                        "start_time": timestamp,
                        "end_time": timestamp,
                        "sequence": 1,
                    }
        return None

    def determine_completion_status(
        self,
        response_data: List[Dict[str, Any]],
    ) -> str:
        """Determine completion status based on captured data."""
        captured = sum(
            1 for item in response_data
            if item.get("remarks") == "verified" and item.get("key_response", "").strip()
        )
        total = len(response_data)

        if captured == 0:
            return "incomplete"
        elif captured >= total - 1:  # All or almost all captured
            return "complete"
        else:
            return "partial"

    def build_payload(
        self,
        conversation: List[Dict[str, Any]],
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        duration_sec: Optional[int] = None,
        dealer_routing: Optional[Dict[str, Any]] = None,
        language: Optional[Dict[str, str]] = None,
        include_transcript: bool = True,
    ) -> Dict[str, Any]:
        """
        Build complete webhook payload.

        Args:
            conversation: List of conversation entries
            start_time: Call start time
            end_time: Call end time
            duration_sec: Call duration in seconds
            dealer_routing: Dealer routing info
            language: Language configuration
            include_transcript: Whether to include raw transcript (for Admin UI)

        Returns:
            Complete payload dict
        """
        response_data = self.extract_response_data(conversation)
        completion_status = self.determine_completion_status(response_data)

        now = datetime.utcnow()
        start = start_time or now
        end = end_time or now
        duration = duration_sec or int((end - start).total_seconds())

        payload = {
            "id": f"bot_{self.call_id}",
            "customer_name": self.customer_name,
            "call_ref_id": self.call_id,
            "call_vendor": "Telephony",
            "recording_url": "",
            "start_time": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end_time": end.strftime("%Y-%m-%d %H:%M:%S"),
            "duration": duration,
            "store_code": self.store_code or "",
            "customer_number": self.customer_number or "",
            "language": language or {
                "welcome": "english",
                "conversational": "english",
            },
            "dealer_routing": dealer_routing or {
                "status": False,
                "reason": "User decided",
                "time": end.strftime("%Y-%m-%d %H:%M:%S"),
            },
            "dropoff": {
                "time": end.strftime("%Y-%m-%d %H:%M:%S"),
                "action": "email",
            },
            "completion_status": completion_status,
            "response_data": response_data,
        }

        # Include raw transcript for Admin UI to enable summary/sentiment analysis
        if include_transcript and conversation:
            payload["transcript"] = conversation

        return payload
