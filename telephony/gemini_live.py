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
# Gemini handles ALL call control decisions based on conversation context.
# Two scenarios trigger these functions:
#   1. End of normal flow: after data confirmation → transfer question → user response
#   2. On-demand: user explicitly asks to talk to a dealer/agent at ANY point
CALL_CONTROL_FUNCTIONS = {
    "function_declarations": [
        {
            "name": "transfer_call",
            "description": """Transfer the call to a human sales agent. 

CRITICAL: You MUST follow the EXACT flow before calling this function.

SCENARIO 1 - Normal flow (MANDATORY steps in order):
  Step 1: Collect ALL 4 data points (name, car model, test drive, email)
  Step 2: Give a ONE-TIME summary confirmation with ALL collected data
          Example: "[Name] ji, toh aap [Model] mein interested hain, test drive [haan/nahi], aur email [email/nahi diya]. Sab theek hai?"
  Step 3: WAIT for user to confirm the summary (YES)
  Step 4: Ask SEPARATELY: "Kya aap humare Sales Team se baat karna chahenge?" / "Would you like to speak with our Sales Team?"
  Step 5: WAIT for user to say YES to the transfer question
  Step 6: ONLY THEN call this function

  DO NOT skip the summary confirmation step.
  DO NOT skip the transfer question step.
  DO NOT combine summary and transfer question into one message.
  The user saying YES to summary confirmation is NOT the same as saying YES to transfer.

SCENARIO 2 - On-demand transfer (ONLY when user EXPLICITLY asks):
  ONLY call this if the customer uses EXPLICIT transfer phrases like:
  - "Mujhe kisi se baat karni hai" / "I want to talk to a person"
  - "Mujhe dealer se baat karni hai" / "Connect me to a dealer"
  - "Mujhe sales team se baat karni hai" / "Transfer me to sales"
  - "Kisi insaan se baat karao" / "I want to speak to someone"
  
  DO NOT trigger on-demand transfer for:
  - General purchase interest ("I want to buy a car")
  - Scheduling requests ("day after tomorrow", "tomorrow")
  - Information requests ("tell me about", "I want to know")
  - Any response that is answering YOUR question

After calling this function, say a brief goodbye message and let the system handle the transfer.""",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "Brief reason: 'Normal flow - user confirmed summary and wants sales team' or 'On-demand - user explicitly asked to talk to a person/dealer'"
                    }
                },
                "required": ["reason"]
            }
        },
        {
            "name": "end_call",
            "description": """End the call gracefully after saying goodbye.

Call this function ONLY after ALL of these steps are complete:
1. All 4 data points collected (name, car model, test drive, email)
2. Summary confirmation given and user confirmed it
3. You asked "Would you like to speak with our Sales Team?" as a SEPARATE question
4. User said NO to the transfer question
5. You said a brief thank you / goodbye

Do NOT call this function:
- If the user wants to be transferred (use transfer_call instead)
- Before giving the summary confirmation
- Before asking the transfer question""",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "reason": {
                        "type": "STRING",
                        "description": "Brief reason for ending (e.g., 'User declined transfer after summary confirmation, call complete')"
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

        # Send setup message (log it for debugging)
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
        
        # Wait for setupComplete to confirm Gemini accepted the configuration
        try:
            raw = await asyncio.wait_for(self._ws.recv(), timeout=10.0)
            resp = json.loads(raw)
            if resp.get("setupComplete"):
                print("🏁 Gemini setupComplete received")
            else:
                print(f"⚠️ Gemini first message was NOT setupComplete: {list(resp.keys())}")
                # Still usable - push message back? No, just log it.
                # The messages() iterator will handle subsequent messages.
        except asyncio.TimeoutError:
            print("❌ Gemini setup timed out (10s) - no setupComplete received")
        except Exception as e:
            print(f"❌ Gemini setup error: {e}")

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

    async def send_function_response(
        self,
        call_id: str,
        func_name: str,
        response: dict,
    ) -> None:
        """
        Send a function call response back to Gemini Live.
        
        Used to reject premature function calls (e.g., transfer_call before
        the transfer question has been asked) — Gemini receives the error
        and continues the conversation properly.
        """
        msg = {
            "tool_response": {
                "function_responses": [
                    {
                        "id": call_id,
                        "name": func_name,
                        "response": response,
                    }
                ]
            }
        }
        await self.send_json(msg)

    async def messages(self) -> AsyncIterator[dict]:
        if not self._ws:
            raise RuntimeError("GeminiLiveSession not connected")
        try:
            async for raw in self._ws:
                yield json.loads(raw)
        except ConnectionClosed as e:
            print(f"⚠️ Gemini WS closed: code={e.code}, reason={e.reason}")
            return


