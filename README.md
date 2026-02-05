# VoiceAgent Admin with Gemini Live 2.5

A full-stack VoiceAgent platform with Admin UI and Telephony service powered by Google Gemini Live 2.5 Flash Native Audio.

## Features

- **Admin UI** (Next.js 14)
  - Dashboard with call analytics and statistics
  - VoiceAgent configuration (system instructions, webhooks, branding)
  - Call history with transcripts, summaries, and sentiment analysis
  - Role-based access control (ADMIN/USER)
  - Customer-specific branding support
  - Live/Test VoiceAgent categorization

- **Telephony Service** (Python)
  - Real-time WebSocket bridge to Gemini Live 2.5
  - Audio resampling (8kHz ↔ 16kHz ↔ 24kHz)
  - Transcript capture and storage
  - Webhook delivery to external endpoints
  - Multi-agent support via URL parameters

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Telephony     │     │   Telephony      │     │   Gemini Live   │
│   Provider      │◄───►│   Service        │◄───►│   2.5 Flash     │
│ (Waybeo, etc.)  │ WS  │   (Python)       │ WS  │   (Google)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              │ HTTP
                              ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   Admin UI       │◄───►│   PostgreSQL    │
                        │   (Next.js)      │     │                 │
                        └──────────────────┘     └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- PostgreSQL 14+
- Google Cloud account with Gemini API access

### 1. Admin UI Setup

```bash
cd admin-ui

# Install dependencies
npm install

# Copy environment template
cp env.example .env.local

# Edit .env.local with your settings:
# - DATABASE_URL
# - NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
# - Customer branding (optional)

# Run database migrations
npx prisma migrate deploy

# Seed demo data
npx prisma db seed

# Start development server
npm run dev
```

Admin UI will be available at http://localhost:3100

**Demo Credentials:**
- Admin: `admin` / `Admin123!`
- User: `user` / `User123!`

### 2. Telephony Service Setup

```bash
cd telephony

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your settings:
# - GCP_PROJECT_ID (required)
# - PORT and WS_PATH

# Authenticate with Google Cloud
gcloud auth application-default login

# Start service
python main.py
```

Telephony service will be available at ws://localhost:8081/ws

### 3. Connect Telephony Provider

Configure your telephony provider (Waybeo, Exotel, Ozonetel, etc.) to connect to:

```
wss://your-domain.com/ws?agent={voiceagent-slug}
```

Example: `wss://voiceagent.example.com/ws?agent=demo-sales`

## Configuration

### Environment Variables

**Admin UI** (`.env.local`):
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/voiceagent"
SHADOW_DATABASE_URL="postgresql://user:pass@localhost:5432/voiceagent_shadow"

# Auth
NEXTAUTH_URL="http://localhost:3100"
NEXTAUTH_SECRET="your-secret-key"

# Optional: Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Optional: Branding
NEXT_PUBLIC_CUSTOMER_NAME="Your Company"
NEXT_PUBLIC_CUSTOMER_LOGO="/logos/your-logo.png"

# Optional: Gemini API for summaries (Admin UI)
GEMINI_API_KEY=""
```

**Telephony Service** (`.env`):
```bash
# Server
HOST=0.0.0.0
PORT=8081
WS_PATH=/ws

# GCP/Gemini (required)
GCP_PROJECT_ID=your-gcp-project

# Optional
GEMINI_VOICE=Aoede
ADMIN_API_BASE=http://127.0.0.1:3100
DATA_BASE_DIR=/data
DEBUG=false
LOG_TRANSCRIPTS=true
```

## Deployment

### Production Checklist

1. [ ] Set up PostgreSQL database
2. [ ] Configure domain and SSL certificates
3. [ ] Set strong NEXTAUTH_SECRET
4. [ ] Add customer logo to `admin-ui/public/logos/`
5. [ ] Configure GCP service account for Gemini access
6. [ ] Set up systemd services for Admin UI and Telephony
7. [ ] Configure nginx for reverse proxy and WebSocket
8. [ ] Create production user accounts
9. [ ] Configure VoiceAgents with proper system instructions
10. [ ] Set up webhook endpoints for post-call data

### Example nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name voiceagent.example.com;

    # Admin UI
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Telephony WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## Customer Deployment

To deploy for a new customer:

1. Clone this repository
2. Update branding in `.env.local`:
   ```bash
   NEXT_PUBLIC_CUSTOMER_NAME="Customer Name"
   NEXT_PUBLIC_CUSTOMER_LOGO="/logos/customer.png"
   ```
3. Add customer logo to `admin-ui/public/logos/`
4. Update seed data with customer-specific VoiceAgents
5. Configure telephony provider integration
6. Deploy to customer infrastructure

## API Reference

### Telephony WebSocket Protocol

**Connect:** `ws://host:port/ws?agent={slug}`

**Events:**
- `start` - Initialize call session (provides UCID)
- `media` - Audio data (8kHz PCM16 samples)
- `stop` - End call session

**Example Start Event:**
```json
{
  "event": "start",
  "ucid": "unique-call-id-123"
}
```

**Example Media Event:**
```json
{
  "event": "media",
  "ucid": "unique-call-id-123",
  "data": {
    "samples": [0, 128, -256, ...],
    "sampleRate": 8000
  }
}
```

### Admin UI API

- `GET /api/voiceagents` - List all VoiceAgents
- `GET /api/voiceagents/:id` - Get VoiceAgent details
- `PATCH /api/voiceagents/:id` - Update VoiceAgent
- `POST /api/calls/ingest` - Ingest call data from telephony
- `GET /api/dashboard/stats` - Dashboard statistics

## License

Copyright (c) Pragyaa.ai. All rights reserved.

## Support

For support, contact: support@pragyaa.ai
