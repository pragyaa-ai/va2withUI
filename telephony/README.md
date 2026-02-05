# VoiceAgent Telephony Service

WebSocket service that bridges telephony audio to Google Gemini Live 2.5 Flash Native Audio for AI-powered voice conversations.

## Features

- Real-time bidirectional audio streaming
- Audio resampling (8kHz <-> 16kHz <-> 24kHz)
- Transcript capture and storage
- Webhook delivery to external endpoints
- Multi-agent support via URL parameters
- Barge-in (interruption) handling

## Requirements

- Python 3.10+
- Google Cloud account with Gemini API access
- GCP Application Default Credentials configured

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your GCP project ID
```

## Configuration

### Required Environment Variables

```bash
GCP_PROJECT_ID=your-gcp-project-id
```

### Optional Environment Variables

```bash
# Server
HOST=0.0.0.0
PORT=8081
WS_PATH=/ws

# Gemini
GEMINI_VOICE=Aoede
GEMINI_MODEL=gemini-live-2.5-flash-native-audio

# Admin UI integration
ADMIN_API_BASE=http://127.0.0.1:3100
ENABLE_ADMIN_PUSH=true

# Data storage
DATA_BASE_DIR=/data
ENABLE_DATA_STORAGE=true

# Logging
DEBUG=false
LOG_TRANSCRIPTS=true
```

## GCP Authentication

The service uses Google Cloud Application Default Credentials (ADC):

```bash
# Local development
gcloud auth application-default login

# Production (use service account)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Required GCP APIs:
- Vertex AI API
- Gemini API

## Usage

### Start the Service

```bash
python main.py
```

### Connect a Telephony Client

WebSocket URL format:
```
ws://host:port/ws?agent={voiceagent-slug}
```

Example:
```
ws://localhost:8081/ws?agent=demo-sales
```

### WebSocket Protocol

**Start Event** (sent by client):
```json
{
  "event": "start",
  "ucid": "unique-call-id-123"
}
```

**Media Event** (bidirectional):
```json
{
  "event": "media",
  "ucid": "unique-call-id-123",
  "data": {
    "samples": [0, 128, -256, ...],
    "sampleRate": 8000,
    "bitsPerSample": 16,
    "channelCount": 1
  }
}
```

**Stop Event** (sent by client):
```json
{
  "event": "stop",
  "ucid": "unique-call-id-123"
}
```

## Multi-Agent Support

The service supports multiple VoiceAgents via the `agent` query parameter:

1. **API-based prompts**: System instructions are fetched from Admin UI
2. **Fallback**: Uses `sample_prompt.txt` if API unavailable

VoiceAgents are created and configured in the Admin UI.

## Data Storage

Call data is stored in agent-specific directories:

```
/data/{agent-slug}/
|-- transcripts/   # Conversation transcripts
|-- si/            # SI webhook payloads
\`-- waybeo/        # Waybeo callback payloads
```

## Webhook Delivery

The service can deliver post-call data to external webhooks:

1. **Admin UI**: Always pushes to Admin UI for storage/analytics
2. **SI Webhook**: If configured in VoiceAgent settings
3. **Waybeo Webhook**: If configured in VoiceAgent settings

Webhook endpoints are configured per VoiceAgent in the Admin UI.

## Systemd Service

Example systemd service file:

```ini
[Unit]
Description=VoiceAgent Telephony Service
After=network.target

[Service]
Type=simple
User=voiceagent
WorkingDirectory=/opt/voiceagent/telephony
Environment=PATH=/opt/voiceagent/telephony/venv/bin
ExecStart=/opt/voiceagent/telephony/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Connection Issues

```bash
# Check if service is running
curl -I http://localhost:8081/

# View logs
journalctl -u voiceagent-telephony -f
```

### Audio Quality

- Adjust buffer sizes: AUDIO_BUFFER_MS_INPUT, AUDIO_BUFFER_MS_OUTPUT
- Lower values = lower latency, higher values = more stable

### Gemini API Errors

- Verify GCP project ID
- Check ADC credentials: gcloud auth application-default print-access-token
- Ensure Vertex AI API is enabled

## License

Copyright (c) Pragyaa.ai. All rights reserved.
