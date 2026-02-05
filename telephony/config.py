"""
VoiceAgent Telephony service configuration.

This service handles WebSocket connections for telephony providers
and bridges audio to Gemini Live for AI-powered voice conversations.

Environment Variables:
- HOST: Server host (default: 0.0.0.0)
- PORT: Server port (default: 8081)
- WS_PATH: WebSocket path (default: /ws)
- GCP_PROJECT_ID: Google Cloud project ID (required)
- GEMINI_MODEL: Gemini model name (default: gemini-live-2.5-flash-native-audio)
- DATA_BASE_DIR: Base directory for data storage (default: /data)
- ADMIN_API_BASE: Admin UI API base URL (default: http://127.0.0.1:3100)
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env if present (optional)
load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


@dataclass(frozen=True)
class Config:
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", os.getenv("PYTHON_PORT", "8081")))
    WS_PATH: str = os.getenv("WS_PATH", "/ws")

    DEBUG: bool = _env_bool("DEBUG", False)
    LOG_TRANSCRIPTS: bool = _env_bool("LOG_TRANSCRIPTS", True)  # Show transcript text in logs

    # GCP / Gemini
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "")
    GEMINI_LOCATION: str = os.getenv("GEMINI_LOCATION", "us-central1")
    GEMINI_MODEL: str = os.getenv(
        "GEMINI_MODEL", "gemini-live-2.5-flash-native-audio"
    )
    GEMINI_VOICE: str = os.getenv("GEMINI_VOICE", "Aoede")

    # Audio
    TELEPHONY_SR: int = int(os.getenv("TELEPHONY_SR", "8000"))  # Telephony input/output
    GEMINI_INPUT_SR: int = int(os.getenv("GEMINI_INPUT_SR", "16000"))  # Gemini mic input
    GEMINI_OUTPUT_SR: int = int(os.getenv("GEMINI_OUTPUT_SR", "24000"))  # Gemini audio output

    # Buffers (ms) - smaller = lower latency, larger = more stable
    AUDIO_BUFFER_MS_INPUT: int = int(os.getenv("AUDIO_BUFFER_MS_INPUT", "100"))
    AUDIO_BUFFER_MS_OUTPUT: int = int(os.getenv("AUDIO_BUFFER_MS_OUTPUT", "100"))

    # Data Storage
    DATA_BASE_DIR: str = os.getenv("DATA_BASE_DIR", "/data")
    ADMIN_API_BASE: str = os.getenv("ADMIN_API_BASE", "http://127.0.0.1:3100")
    ENABLE_DATA_STORAGE: bool = _env_bool("ENABLE_DATA_STORAGE", True)
    ENABLE_ADMIN_PUSH: bool = _env_bool("ENABLE_ADMIN_PUSH", True)

    @property
    def AUDIO_BUFFER_SAMPLES_INPUT(self) -> int:
        return int((self.AUDIO_BUFFER_MS_INPUT / 1000.0) * self.TELEPHONY_SR)

    @property
    def AUDIO_BUFFER_SAMPLES_OUTPUT(self) -> int:
        return int((self.AUDIO_BUFFER_MS_OUTPUT / 1000.0) * self.TELEPHONY_SR)

    @property
    def model_uri(self) -> str:
        return (
            f"projects/{self.GCP_PROJECT_ID}/locations/{self.GEMINI_LOCATION}"
            f"/publishers/google/models/{self.GEMINI_MODEL}"
        )

    @classmethod
    def validate(cls, cfg: "Config") -> None:
        if not cfg.GCP_PROJECT_ID:
            raise ValueError("GCP_PROJECT_ID is required (e.g. your-gcp-project)")

        if not cfg.WS_PATH.startswith("/"):
            raise ValueError("WS_PATH must start with '/' (e.g. /ws)")

    def print_config(self) -> None:
        print("=" * 68)
        print("VoiceAgent Telephony (Gemini Live) - Configuration")
        print("=" * 68)
        print(f"Server: ws://{self.HOST}:{self.PORT}{self.WS_PATH}")
        print(f"Gemini model: {self.GEMINI_MODEL}")
        print(f"Voice: {self.GEMINI_VOICE}")
        print(f"Location: {self.GEMINI_LOCATION}")
        print(f"Project: {self.GCP_PROJECT_ID}")
        print(
            f"Audio SR: telephony={self.TELEPHONY_SR}Hz, "
            f"gemini_in={self.GEMINI_INPUT_SR}Hz, gemini_out={self.GEMINI_OUTPUT_SR}Hz"
        )
        print(
            f"Buffers: in={self.AUDIO_BUFFER_MS_INPUT}ms "
            f"({self.AUDIO_BUFFER_SAMPLES_INPUT} samples), "
            f"out={self.AUDIO_BUFFER_MS_OUTPUT}ms "
            f"({self.AUDIO_BUFFER_SAMPLES_OUTPUT} samples)"
        )
        print(f"Data dir: {self.DATA_BASE_DIR}")
        print(f"Data storage: {'enabled' if self.ENABLE_DATA_STORAGE else 'disabled'}")
        print(f"Admin push: {'enabled' if self.ENABLE_ADMIN_PUSH else 'disabled'}")
        print(f"DEBUG: {self.DEBUG}")
        print("=" * 68)


# Agent to directory mapping (optional overrides)
# By default, agents use their slug as directory name
# Add explicit mappings only if needed for legacy compatibility
AGENT_DIRS = {
    # "demo-sales": "demo",  # Example: map demo-sales -> demo directory
}


def get_agent_dir(agent: str) -> str:
    """
    Get the data directory name for an agent.
    
    - Explicit mappings in AGENT_DIRS take precedence
    - Otherwise, uses the agent slug directly as directory name
    - This allows new VoiceAgents added via UI to auto-create directories
    """
    return AGENT_DIRS.get(agent.lower(), agent.lower())
