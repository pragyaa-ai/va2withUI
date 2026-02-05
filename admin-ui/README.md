# Kia VoiceAgent Admin UI

Admin UI for managing VoiceAgent configurations and tracking usage.

## Features (MVP)

- Create/edit **VoiceAgents** with key parameters:
  - **Greeting** – First message spoken when a call starts
  - **Voice** – Indian names: Ananya, Priya, Chitra, Kavya, Farhan
  - **Accent** – Indian, American, British
  - **Language** – English, Hindi
  - **Engine** – Primary or Secondary
- Create/edit **call flows** (greeting + ordered steps)
- Manage **guardrails**
- Manage **voice profiles** (advanced settings)
- Capture **testing feedback**
- Track **calls and minutes** (usage events)

## Tech

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth (Google)

## Environment variables

Create `admin-ui/.env` (for Prisma) and `admin-ui/.env.local` (for NextAuth):

```bash
# .env (Prisma)
DATABASE_URL="postgresql://voiceagent_admin:REPLACE_ME@127.0.0.1:5433/voiceagent_admin"
SHADOW_DATABASE_URL="postgresql://voiceagent_admin:REPLACE_ME@127.0.0.1:5433/voiceagent_shadow"

# .env.local (NextAuth)
NEXTAUTH_URL="https://voiceagentadmin.pragyaa.ai"
NEXTAUTH_SECRET="REPLACE_WITH_RANDOM"
GOOGLE_CLIENT_ID="REPLACE_ME"
GOOGLE_CLIENT_SECRET="REPLACE_ME"
```

## Run locally

```bash
cd admin-ui
npm install
npm run dev -- --port 3100
```

## Database

```bash
cd admin-ui
npx prisma generate
npx prisma migrate dev --name init
```

## Seed Kia VoiceAgent

After migration, run the seed to create the default Kia VoiceAgent:

```bash
npx prisma db seed
```

This creates a pre-configured "Kia VoiceAgent" with:
- Greeting: "Namaste! Welcome to Kia Motors..."
- Voice: Ananya (Indian)
- Accent: Indian
- Language: English
- Default call flow steps
- Basic guardrails
