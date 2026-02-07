"""
Agent-aware data storage for VoiceAgent telephony.

Saves transcripts and payloads to agent-specific directories:
- /data/kia2/transcripts/  - Kia v2 (Gemini Live) transcripts
- /data/kia2/si/           - SI webhook payloads
- /data/kia2/waybeo/       - Waybeo callback payloads
- /data/tata/...           - Tata VoiceAgent
- /data/skoda/...          - Skoda VoiceAgent
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import Config, get_agent_dir


class AgentDataStorage:
    """Handles file-based data storage for a specific agent."""

    def __init__(self, agent: str, cfg: Optional[Config] = None):
        self.agent = agent.lower()
        self.cfg = cfg or Config()
        self.agent_dir = get_agent_dir(self.agent)
        self.base_path = Path(self.cfg.DATA_BASE_DIR) / self.agent_dir

        # Subdirectories
        self.transcripts_dir = self.base_path / "transcripts"
        self.si_dir = self.base_path / "si"
        self.waybeo_dir = self.base_path / "waybeo"

    def ensure_directories(self) -> None:
        """Create all required directories if they don't exist."""
        for dir_path in [self.transcripts_dir, self.si_dir, self.waybeo_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)

    def _generate_filename(self, call_id: str, suffix: str) -> str:
        """Generate a timestamped filename."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"call_{call_id}_{timestamp}_{suffix}.json"

    def save_transcript(
        self,
        call_id: str,
        conversation: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        """
        Save conversation transcript to agent's transcripts directory.

        Args:
            call_id: Unique call identifier (UCID)
            conversation: List of {timestamp, speaker, text} entries
            metadata: Optional additional metadata

        Returns:
            Saved filepath or None on error
        """
        if not self.cfg.ENABLE_DATA_STORAGE:
            return None

        try:
            self.ensure_directories()
            filename = self._generate_filename(call_id, "transcript")
            filepath = self.transcripts_dir / filename

            transcript_data = {
                "call_id": call_id,
                "agent": self.agent,
                "saved_at": datetime.utcnow().isoformat() + "Z",
                "conversation": conversation,
                "conversation_count": len(conversation),
                "metadata": metadata or {},
            }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(transcript_data, f, indent=2, ensure_ascii=False)

            print(f"[{call_id}] 📄 Transcript saved: {filepath}")
            return str(filepath)

        except Exception as e:
            print(f"[{call_id}] ❌ Failed to save transcript: {e}")
            return None

    def load_transcript(self, filepath: str) -> Optional[Dict[str, Any]]:
        """Load a saved transcript JSON file."""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ Failed to load transcript: {e}")
            return None

    def save_si_payload(
        self,
        call_id: str,
        payload: Dict[str, Any],
    ) -> Optional[str]:
        """
        Save SI (Single Interface) webhook payload.

        Args:
            call_id: Unique call identifier
            payload: SI webhook format payload

        Returns:
            Saved filename or None on error
        """
        if not self.cfg.ENABLE_DATA_STORAGE:
            return None

        try:
            self.ensure_directories()
            filename = self._generate_filename(call_id, "si")
            filepath = self.si_dir / filename

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)

            print(f"[{call_id}] 📤 SI payload saved: {filepath}")
            return filename

        except Exception as e:
            print(f"[{call_id}] ❌ Failed to save SI payload: {e}")
            return None

    def save_waybeo_payload(
        self,
        call_id: str,
        payload: Dict[str, Any],
    ) -> Optional[str]:
        """
        Save Waybeo callback payload for debugging.

        Args:
            call_id: Unique call identifier
            payload: Waybeo callback data

        Returns:
            Saved filename or None on error
        """
        if not self.cfg.ENABLE_DATA_STORAGE:
            return None

        try:
            self.ensure_directories()
            filename = self._generate_filename(call_id, "waybeo")
            filepath = self.waybeo_dir / filename

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)

            print(f"[{call_id}] 📞 Waybeo payload saved: {filepath}")
            return filename

        except Exception as e:
            print(f"[{call_id}] ❌ Failed to save Waybeo payload: {e}")
            return None
