"""
Gemini Live session client for telephony.

This is the server-side equivalent of the browser demo logic in `frontend/geminilive.js`,
implemented for asyncio Python websockets.
"""

from __future__ import annotations

import asyncio
import json
import ssl
from dataclasses import dataclass
from typing import AsyncIterator, Optional

import certifi
import google.auth
from google.auth.transport.requests import Request
import websockets
from websockets.exceptions import ConnectionClosed


@dataclass(frozen=True)
class GeminiSessionConfig:
    service_url: str
    model_uri: str
    voice: str
    system_instructions: str
    temperature: float = 1.0
    enable_affective_dialog: bool = True
    enable_input_transcription: bool = True
    enable_output_transcription: bool = True

    # Barge-in / activity detection tuned for telephony
    vad_silence_ms: int = 300
    vad_prefix_ms: int = 400
    activity_handling: str = "START_OF_ACTIVITY_INTERRUPTS"
    start_of_speech_sensitivity: str = "START_SENSITIVITY_HIGH"
    end_of_speech_sensitivity: str = "END_SENSITIVITY_HIGH"
    
    # Enable function calling for call control
    enable_call_control: bool = True


# Function declarations for Gemini Live 2.5 to call
# These are triggered by Gemini based on conversation flow
CALL_CONTROL_FUNCTIONS = {
    "function_declarations": [
        {
            "name": "transfer_call",
            "description": "Transfer the call to a human sales agent. Call this ONLY when the user explicitly says YES to speaking with a sales agent or dealer representative.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "Why the user wants to transfer (e.g., 'User wants to speak with sales team')"
                    }
                },
                "required": ["reason"]
            }
        },
        {
            "name": "end_call",
            "description": "End the call gracefully. Call this when the user says NO to speaking with an agent, or when the conversation is complete and user wants to end the call.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "Why the call is ending (e.g., 'User declined agent transfer', 'Conversation complete')"
                    }
                },
                "required": ["reason"]
            }
        }
    ]
}
    


class GeminiLiveSession:
    def __init__(self, cfg: GeminiSessionConfig):
        self.cfg = cfg
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

    @staticmethod
    def _generate_access_token() -> str:
        creds, _ = google.auth.default()
        if not creds.valid:
            creds.refresh(Request())
        return creds.token

    async def connect(self) -> None:
        token = self._generate_access_token()
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        ssl_context = ssl.create_default_context(cafile=certifi.where())

        # Use extra_headers for broad compatibility with websockets versions.
        self._ws = await websockets.connect(
            self.cfg.service_url, extra_headers=headers, ssl=ssl_context
        )

        # Send setup message
        setup_msg = {
            "setup": {
                "model": self.cfg.model_uri,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "temperature": self.cfg.temperature,
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {"voice_name": self.cfg.voice}
                        }
                    },
                    "enable_affective_dialog": self.cfg.enable_affective_dialog,
                },
                "system_instruction": {"parts": [{"text": self.cfg.system_instructions}]},
                "realtime_input_config": {
                    "automatic_activity_detection": {
                        "disabled": False,
                        "silence_duration_ms": self.cfg.vad_silence_ms,
                        "prefix_padding_ms": self.cfg.vad_prefix_ms,
                        "start_of_speech_sensitivity": self.cfg.start_of_speech_sensitivity,
                        "end_of_speech_sensitivity": self.cfg.end_of_speech_sensitivity,
                    },
                    "activity_handling": self.cfg.activity_handling,
                },
            }
        }

        if self.cfg.enable_input_transcription:
            setup_msg["setup"]["input_audio_transcription"] = {}
        if self.cfg.enable_output_transcription:
            setup_msg["setup"]["output_audio_transcription"] = {}
        
        # Enable function calling for transfer/hangup control
        if self.cfg.enable_call_control:
            setup_msg["setup"]["tools"] = [CALL_CONTROL_FUNCTIONS]

        await self.send_json(setup_msg)

    async def close(self) -> None:
        if self._ws is not None and not self._ws.closed:
            await self._ws.close()

    async def send_json(self, msg: dict) -> None:
        if not self._ws:
            raise RuntimeError("GeminiLiveSession not connected")
        await self._ws.send(json.dumps(msg))

    async def send_audio_b64_pcm16(self, audio_b64: str) -> None:
        # Matches browser demo: mime_type "audio/pcm"
        await self.send_json(
            {
                "realtime_input": {
                    "media_chunks": [{"mime_type": "audio/pcm", "data": audio_b64}]
                }
            }
        )

    async def trigger_greeting(self) -> None:
        """
        Send a client message to trigger the AI to start speaking immediately.
        This avoids the delay waiting for user audio input.
        """
        await self.send_json(
            {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [{"text": "Hello"}]
                        }
                    ],
                    "turn_complete": True
                }
            }
        )

    async def messages(self) -> AsyncIterator[dict]:
        if not self._ws:
            raise RuntimeError("GeminiLiveSession not connected")
        try:
            async for raw in self._ws:
                yield json.loads(raw)
        except ConnectionClosed:
            return


