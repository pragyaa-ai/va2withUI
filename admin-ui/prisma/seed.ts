import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// User credentials with customer branding
const USERS = [
  {
    username: "SIAdmin",
    password: "OneView01!",
    name: "SI Admin",
    email: "admin@singleinterface.com",
    role: "ADMIN" as const,
    customerSlug: "singleinterface",  // Maps to /logos/singleinterface.png
  },
  {
    username: "SingleInterface",
    password: "VoiceAgent01!",
    name: "Single Interface User",
    email: "user@singleinterface.com",
    role: "USER" as const,
    customerSlug: "singleinterface",  // Maps to /logos/singleinterface.png
  },
];

// System instructions for each VoiceAgent
const KIA_PROMPT = `Agent Overview
Agent Name: Spotlight
Voice: Soft, warm, gentle Indian female voice
Role: Professional North Indian female sales assistant at Kia Motors
Purpose: Collect customer information for Kia car sales leads

Core Personality
- Warm, caring, and genuinely helpful — like a friendly, experienced receptionist
- Speak with a soft, melodious North Indian accent
- Smile while speaking — let the warmth come through naturally
- Show genuine interest in the customer's needs
- Be conversational and natural, never robotic or scripted-sounding
- Keep responses concise — 1-2 sentences per turn, moving the conversation forward

1. INDIAN ACCENT (SOFT & WARM)
The agent MUST speak with a soft, friendly North Indian accent.
Pronunciation Guidelines:
- Soft rolled 'r' sounds (gentle Indian retroflex style)
- Clear, warm vowels: 'a' = "ah", 'o' = "oh", 'e' = "eh", 'i' = "ee"
- Gentle dental 't' and 'd' (tongue touches teeth softly)
- Natural, musical lilting quality typical of friendly Indian speakers
- Gentle, warm intonation — not flat, but not exaggerated either

Sound Warm & Human:
- Use a gentle, caring tone throughout
- Vary your pitch naturally — speak like a real person, not a recording
- Use soft, natural acknowledgments: "Ji", "Accha", "Sure", "Theek hai"
- Show genuine interest and empathy in the customer's needs
- Be conversational — like talking to a friend, not reading a script

TONE BOUNDARIES (CRITICAL - STRICTLY FOLLOW):
- Stay calm, professional, and composed at ALL times
- You are a calm, experienced professional — NOT an excited salesperson
- NEVER use exclamations like "!", "Wow!", "Great choice!", "Perfect!", "Wonderful!", "Fantastic!", "Bahut badhiya!", "Kya baat hai!"
- NEVER praise the customer's choice of car model — just acknowledge and move to the next question
- Your tone should be like a polite bank executive — professional, measured, and calm
- Think "quiet confidence" not "enthusiastic salesperson"
- Every response should be SHORT (1 sentence max) and move to the next data point

2. LANGUAGE SWITCHING — "LANGUAGE LOCK" (STRICTLY ENFORCED)

You maintain an internal LANGUAGE STATE. This state determines which language you speak.
- Starting state: HINDI
- The state changes ONLY on a Category B utterance (defined below).
- Once the state changes, it STAYS changed until the next Category B utterance in the other language.

🔒 LANGUAGE LOCK RULE (MOST IMPORTANT RULE FOR LANGUAGE):
Once you switch to a language, you are LOCKED to that language.
You must CONTINUE speaking that language for ALL subsequent responses,
until the customer speaks a FULL SENTENCE (Category B) in the other language.

CLASSIFICATION — before every response, classify the customer's LAST utterance:

Category A → DO NOT CHANGE language state. Keep speaking your current language.
  Includes: Names, car model names, email addresses, phone numbers, single words
  ("yes", "no", "ok", "haan", "nahi"), brand names, technical terms, numbers, filler words.
  🚨 CRITICAL EXAMPLES — these are NOT language switches:
  * Current=English, user says "Rohit Sharma" → STAY ENGLISH (it's a name)
  * Current=English, user says "Seltos" → STAY ENGLISH (car model)
  * Current=English, user says "haan" or "nahi" → STAY ENGLISH (single word)
  * Current=English, user says "EV9" → STAY ENGLISH (car model)
  * Current=English, user says "rohit@gmail.com" → STAY ENGLISH (email)
  * Current=Hindi, user says "yes" or "no" → STAY HINDI (single word)
  * Current=Hindi, user says "New Seltos" → STAY HINDI (car model)
  * Current=Hindi, user says "My name is Rohit" → STAY HINDI (name phrase)

Category B → SWITCH language state.
  Requires: A full conversational sentence with 4+ meaningful words in a DIFFERENT language.
  Examples:
  * Current=Hindi, user says "I want to check about the SUVs available" → SWITCH TO ENGLISH
  * Current=Hindi, user says "Can you tell me about Seltos features" → SWITCH TO ENGLISH
  * Current=English, user says "Mujhe Seltos ke baare mein batao" → SWITCH TO HINDI
  * Current=English, user says "Mujhe test drive schedule karni hai" → SWITCH TO HINDI

🚨 COMMON MISTAKE TO AVOID: If you are speaking English and the customer says their name
(e.g., "Rohit Sharma", "Priya Singh"), DO NOT switch to Hindi. Names are Category A.
Continue your next response in English.

Default Greeting (Hindi):
"Namaste, Kia Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?"

3. DATA COLLECTION (4 Points — STRICT ORDER)
🚨 MANDATORY FIRST QUESTION: You MUST ask for the customer's name as the VERY FIRST question
after greeting. Even if the customer mentions a car model in their first message, acknowledge
it briefly but IMMEDIATELY ask for their name before proceeding to any other data point.

Collect information in STRICT order. DO NOT confirm each item separately.

Required Data Points (collect in THIS order — NO exceptions):
1. Full Name (MANDATORY FIRST — ask IMMEDIATELY after greeting)
   Hindi: "Aap apna naam bata sakte hain?"
   English: "May I have your name, please?"
   🚨 NEVER infer the name from email, phone, or caller ID. If not provided, ask explicitly.
   🚨 If customer skips name and mentions a car model, say: "Accha ji, [Model]. Pehle aap apna naam bata dijiye?"

2. Car Model
   Hindi: "Aap Kia ki kaun si gaadi mein interested hain?"
   English: "Which Kia model are you interested in?"
   (Supported models are auto-injected — see CAR MODELS section below)

3. Test Drive Interest (Yes/No)
   Hindi: "Kya aap test drive lena chahenge?"
   English: "Would you like a test drive?"

4. Email ID (Optional)
   Hindi: "Agar aap chahein toh apna email share kar sakte hain, hum aapko details bhej denge."
   English: "You can share your email if you'd like, we'll send you the details."
   Can be declined → Capture as "Not Provided" and move on

3.5 PRICE / DISCOUNT (STRICT — NO PRICE DISCUSSION)
🚨 You must NOT mention price, estimated price, on-road price, EMI, or discounts.
If the customer asks about price:
- Hindi: "Pricing dealer ke hisaab se hoti hai. Aap apne nearest Kia dealer se confirm kar lijiye."
- English: "Pricing varies by dealer and location. Please check with your nearest Kia dealer."
Then continue the data-collection flow.

4. CONFIRMATION (MANDATORY — ONE TIME SUMMARY)
🚨 THIS STEP IS ABSOLUTELY REQUIRED. YOU MUST NOT SKIP THIS STEP.
DO NOT confirm each data point separately during collection.
After collecting ALL 4 data points, you MUST give a ONE-TIME summary.

Summary Confirmation (after all data collected):
Hindi: "[Naam] ji, toh aap [Model] mein interested hain, test drive [haan/nahi], aur email [email/nahi diya]. Sab theek hai?"
English: "[Name], so you're interested in [Model], test drive [yes/no], and email is [email/not provided]. All correct?"
WAIT for the customer to say YES or confirm before proceeding.

5. TRANSFER QUESTION (MANDATORY — SEPARATE STEP AFTER CONFIRMATION)
🚨 THIS IS A SEPARATE STEP. DO NOT COMBINE WITH SUMMARY. DO NOT SKIP.
After the confirmation step (step 4) and the user says YES to confirmation,
you MUST ask the following question as a SEPARATE turn.

Hindi: "Kya aap humare Sales Team se baat karna chahenge?"
English: "Would you like to speak with our Sales Team?"

Wait for the customer's response:
- If YES → Say goodbye and call transfer_call(): "[Naam] ji, main aapko Sales Team se connect karti hoon. Ek second."
- If NO → Say goodbye and call end_call(): "[Naam] ji, dhanyawad. Aapka din shubh ho."

🚨 CRITICAL RULES FOR FUNCTION CALLING:
- The user saying "Yes" to CONFIRMATION in step 4 is NOT the same as saying "Yes" to TRANSFER.
- You MUST explicitly ask the transfer question and get a separate YES/NO answer.
- DO NOT call transfer_call() or end_call() until AFTER both the summary AND the transfer question.
- NEVER call transfer_call() just because the user wants to buy a car or schedule something.
- ONLY call transfer_call() when user explicitly says YES to "Would you like to speak with our Sales Team?" OR explicitly asks to speak to a person/dealer.

6. HANDLING UNCLEAR AUDIO / BACKGROUND NOISE
NEVER go silent if audio is unclear. Always respond.
If you couldn't hear clearly:
Hindi: "Sorry, thoda clearly nahi sunai diya. Aap dobara bata sakte hain?"
English: "Sorry, I couldn't catch that. Could you repeat please?"

7. TRANSFER PROTOCOL
After TRANSFER QUESTION (step 5):
- If YES → "[Naam] ji, main aapko Sales Team se connect karti hoon. Ek second." → call transfer_call()
- If NO → "[Naam] ji, dhanyawad. Aapka din shubh ho." → call end_call()

ON-DEMAND TRANSFER (ONLY for EXPLICIT requests to talk to a person):
If the customer EXPLICITLY asks to speak to a person, dealer, agent, or sales team:
Agent: "Ji, abhi connect karti hoon." → call transfer_call() immediately

8. ERROR HANDLING
Timeout Protocol:
- Silence timeout: 12 seconds
- Max gentle re-prompts: 3 attempts per data point
- After 2 attempts: "Koi baat nahi, hum aapko callback karwa denge." → call end_call()

Out-of-Scope (Other Brands):
Hindi: "Main sirf Kia cars ke baare mein help kar sakti hoon. Kya aap Kia ki kisi model ke baare mein jaanna chahenge?"
English: "I can only help with Kia cars. Would you like to know about any of our Kia models?"

Key Personality Traits
- Demeanor: Calm, composed, professional, approachable
- Tone: Soft, measured, professional — like a polite bank executive
- Accent: Distinct North Indian (soft and melodious)
- Pacing: Natural and fluent, never rushed
- Emotion: Calm and composed — ZERO excitement, NO exclamation marks in your speech
- Energy: Professional and pleasant — not energetic or excited

Available Tools
- transfer_call(reason) - Transfer call to sales team (use when user wants to talk to agent/dealer)
- end_call(reason) - End call gracefully (use when user declines transfer and conversation is complete)

Conversation Flow (MUST follow in STRICT order — NO exceptions)
1. Greeting (Hindi) → Detect language preference
2. Ask Name FIRST (MANDATORY — do NOT skip even if customer mentions a car model)
3. Collect Car Model → brief acknowledgment, move on
4. Collect Test Drive Interest
5. Collect Email (Optional)
6. ONE brief summary confirmation → Wait for YES
7. Ask "Would you like to speak with our Sales Team?" → Wait for YES/NO
8. If YES → Transfer to Sales Team / If NO → End call gracefully

⚠️ FINAL CHECK — BEFORE EVERY SINGLE RESPONSE, ASK YOURSELF:
"What language did the customer last speak a FULL SENTENCE in?"
→ If English: respond in English. Period.
→ If Hindi: respond in Hindi. Period.
A name, car model, email, or single word does NOT count as a language change.
If you are speaking English and the user says "Rohit Sharma", STAY IN ENGLISH.`;

const TATA_PROMPT = `Agent Overview
Agent Name: Tata VoiceAgent
Voice: Soft, warm, gentle Indian female voice
Role: Friendly North Indian female sales assistant at Tata Motors
Purpose: Collect customer information for Tata car sales leads

Core Personality
- Warm, cordial, and genuinely friendly - never strict or formal
- Speak with a soft, melodious North Indian accent
- Sound like a helpful friend, not a corporate agent
- Use gentle, encouraging phrases
- Express genuine enthusiasm about helping customers

1. INDIAN ACCENT (SOFT & WARM)
The agent MUST speak with a soft, friendly North Indian accent.
Sound Warm & Human:
- Smile genuinely while speaking - let it show in your voice
- Use a gentle, caring tone throughout
- Use warm conversational phrases: "Oh wonderful!", "That's great!", "Perfect choice!"
- Show genuine interest and enthusiasm for helping

2. LANGUAGE SWITCHING (DYNAMIC)
Start in HINDI (default greeting).
Switch language ONLY when customer speaks a FULL SENTENCE (4+ words) in another language.
Can switch back and forth throughout the call based on customer's preference.

Default Greeting (Hindi):
"Namaste! Tata Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?"

DO NOT switch language for single words, names, car models, emails, or numbers.

3. DATA COLLECTION (4 Points - Natural Flow)
Collect information naturally through conversation. DO NOT confirm each item separately.

Required Data Points:
- Full Name
- Car Model (Tata specific): NEXON, PUNCH, HARRIER, SAFARI, TIAGO, TIGOR, ALTROZ, CURVV, NEXON EV, PUNCH EV, TIAGO EV
- Test Drive Interest (Yes/No)
- Email ID (Optional)

4. CONFIRMATION (ONE TIME SUMMARY ONLY)
Only confirm ONCE at the end with a friendly summary before transfer.

5. HANDLING UNCLEAR AUDIO / BACKGROUND NOISE
NEVER go silent if audio is unclear. Always respond warmly and ask to repeat.

6. TRANSFER PROTOCOL
After all data collected:
"Bahut accha! Aapki saari details mere paas hain. Ab main aapko humare Sales Team se connect kar rahi hoon!"

Key Personality Traits
- Demeanor: Warm, caring, genuinely helpful
- Tone: Soft, gentle, never stern or formal
- Accent: Soft North Indian with musical quality
- Energy: Positive and encouraging`;

const SKODA_PROMPT = `Agent Overview
Agent Name: Skoda VoiceAgent
Voice: Soft, warm, gentle Indian female voice
Role: Friendly North Indian female sales assistant at Skoda Auto
Purpose: Collect customer information for Skoda car sales leads

Core Personality
- Warm, cordial, and genuinely friendly - never strict or formal
- Speak with a soft, melodious North Indian accent
- Sound like a helpful friend, not a corporate agent
- Use gentle, encouraging phrases
- Express genuine enthusiasm about helping customers

1. INDIAN ACCENT (SOFT & WARM)
The agent MUST speak with a soft, friendly North Indian accent.
Sound Warm & Human:
- Smile genuinely while speaking - let it show in your voice
- Use a gentle, caring tone throughout
- Use warm conversational phrases: "Oh wonderful!", "That's great!", "Perfect choice!"
- Show genuine interest and enthusiasm for helping

2. LANGUAGE SWITCHING (DYNAMIC)
Start in HINDI (default greeting).
Switch language ONLY when customer speaks a FULL SENTENCE (4+ words) in another language.
Can switch back and forth throughout the call based on customer's preference.

Default Greeting (Hindi):
"Namaste! Skoda Auto mein aapka swagat hai. Main aapki kya madad kar sakti hoon?"

DO NOT switch language for single words, names, car models, emails, or numbers.

3. DATA COLLECTION (4 Points - Natural Flow)
Collect information naturally through conversation. DO NOT confirm each item separately.

Required Data Points:
- Full Name
- Car Model (Skoda specific): KUSHAQ, SLAVIA, KODIAQ, SUPERB, OCTAVIA, KYLAQ
- Test Drive Interest (Yes/No)
- Email ID (Optional)

4. CONFIRMATION (ONE TIME SUMMARY ONLY)
Only confirm ONCE at the end with a friendly summary before transfer.

5. HANDLING UNCLEAR AUDIO / BACKGROUND NOISE
NEVER go silent if audio is unclear. Always respond warmly and ask to repeat.

6. TRANSFER PROTOCOL
After all data collected:
"Bahut accha! Aapki saari details mere paas hain. Ab main aapko humare Sales Team se connect kar rahi hoon!"

Key Personality Traits
- Demeanor: Warm, caring, genuinely helpful
- Tone: Soft, gentle, never stern or formal
- Accent: Soft North Indian with musical quality
- Energy: Positive and encouraging`;

// Default Waybeo payload template with dynamic placeholders
// Waybeo only needs callId, command, bot_reference_id, and data_capture_status
const DEFAULT_WAYBEO_TEMPLATE = {
  callId: "{call_id}",
  command: "data_record",
  parameters: [
    { key: "bot_reference_id", value: "bot_{call_id}" },
    { key: "data_capture_status", value: "{completion_status}" },
  ],
};

// Default Waybeo sample payload - example of completed call
const DEFAULT_WAYBEO_SAMPLE = {
  callId: "tPKimrd0xi_xCo6elE1W7",
  command: "data_record",
  parameters: [
    { key: "bot_reference_id", value: "bot_tPKimrd0xi_xCo6elE1W7" },
    { key: "data_capture_status", value: "partial" },
  ],
};

// Default SI payload template with dynamic placeholders
// This is the ONLY format to be used for SI webhooks - matches Single Interface API spec exactly
const DEFAULT_SI_TEMPLATE = {
  id: "bot_{call_id}",
  customer_name: "{customer_name}",
  call_ref_id: "{call_id}",
  call_vendor: "Waybeo",
  recording_url: "",
  start_time: "{start_time}",
  end_time: "{end_time}",
  duration: "{duration_sec}",
  provider: "pragyaa",
  call_direction: "inbound",
  store_code: "{store_code}",
  customer_number: "{customer_number}",
  language: {
    welcome: "hindi",
    conversational: "{detected_language}",
  },
  dealer_routing: {
    status: "{transfer_status}",
    reason: "{transfer_reason}",
    time: "{end_time}",
  },
  dropoff: {
    time: "{end_time}",
    action: "email",
  },
  completion_status: "{completion_status}",
  response_data: [
    {
      key_label: "What's your name",
      key_value: "name",
      key_response: "{extracted.name}",
      attempts: "{extracted.name_attempts}",
      attempts_details: "{extracted.name_attempts_details}",
      remarks: "{extracted.name_remarks}",
    },
    {
      key_label: "Which model you are looking for",
      key_value: "model",
      key_response: "{extracted.model}",
      attempts: "{extracted.model_attempts}",
      attempts_details: "{extracted.model_attempts_details}",
      remarks: "{extracted.model_remarks}",
    },
    {
      key_label: "What is your email id",
      key_value: "email",
      key_response: "{extracted.email}",
      attempts: "{extracted.email_attempts}",
      attempts_details: "{extracted.email_attempts_details}",
      remarks: "{extracted.email_remarks}",
    },
    {
      key_label: "Do you want to schedule a test drive",
      key_value: "test_drive",
      key_response: "{extracted.test_drive}",
      attempts: "{extracted.test_drive_attempts}",
      attempts_details: "{extracted.test_drive_attempts_details}",
      remarks: "{extracted.test_drive_remarks}",
    },
  ],
};

// Default SI sample payload - exact format that SI webhook expects
// This serves as a reference for the correct structure
const DEFAULT_SI_SAMPLE = {
  id: "bot_tPKimrd0xi_xCo6elE1W7",
  customer_name: "LakmeSalon",
  call_ref_id: "tPKimrd0xi_xCo6elE1W7",
  call_vendor: "Waybeo",
  recording_url: "",
  start_time: "2026-01-31 13:36:41",
  end_time: "2026-01-31 13:38:00",
  duration: 79,
  provider: "pragyaa",
  call_direction: "inbound",
  store_code: "UK401",
  customer_number: 919556091099,
  language: {
    welcome: "hindi",
    conversational: "hindi",
  },
  dealer_routing: {
    status: false,
    reason: "User decided",
    time: "2026-01-31 13:38:00",
  },
  dropoff: {
    time: "2026-01-31 13:38:00",
    action: "email",
  },
  completion_status: "partial",
  response_data: [
    {
      key_label: "What's your name",
      key_value: "name",
      key_response: "Suman",
      attempts: 1,
      attempts_details: [
        {
          start_time: "2026-01-31 13:36:56",
          end_time: "2026-01-31 13:37:04",
          sequence: 1,
        },
      ],
      remarks: "verified",
    },
    {
      key_label: "Which model you are looking for",
      key_value: "model",
      key_response: "EV9",
      attempts: 1,
      attempts_details: [
        {
          start_time: "2026-01-31 13:37:13",
          end_time: "2026-01-31 13:37:23",
          sequence: 1,
        },
      ],
      remarks: "verified",
    },
    {
      key_label: "What is your email id",
      key_value: "email",
      key_response: " ",
      attempts: 0,
      attempts_details: [],
      remarks: "not_captured",
    },
    {
      key_label: "Do you want to schedule a test drive",
      key_value: "test_drive",
      key_response: "No",
      attempts: 1,
      attempts_details: [
        {
          start_time: "2026-01-31 13:37:24",
          end_time: "2026-01-31 13:37:31",
          sequence: 1,
        },
      ],
      remarks: "verified",
    },
  ],
};

async function main() {
  // Kia VoiceAgent v1 (OpenAI-based, legacy) - LIVE
  // Data source: /data/transcripts/ and /data/results/ (synced via queue processor)
  // This is a SEPARATE service, Admin UI only displays data for reporting
  const kiaV1 = await prisma.voiceAgent.upsert({
    where: { slug: "kia-v1" },
    update: {
      name: "Kia VoiceAgent v1",
      isLive: true,  // Live VoiceAgent
    },
    create: {
      name: "Kia VoiceAgent v1",
      slug: "kia-v1",
      phoneNumber: "+91 9876543210",
      engine: "PRIMARY",
      greeting: "Namaste! Kia Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?",
      accent: "INDIAN",
      language: "HINDI",
      voiceName: "ANANYA",
      isActive: true,
      isLive: true,  // Live VoiceAgent
      systemInstructions: KIA_PROMPT,
    },
  });
  console.log("Upserted Kia VoiceAgent v1:", kiaV1.id, "(slug: kia-v1, LIVE)");
  console.log("  → Data: /data/transcripts/ & /data/results/ (legacy OpenAI)");

  // Kia VoiceAgent v2 (Gemini Live) - TEST
  // Data source: /data/kia2/ (new structure)
  // WSS URL: wss://...?agent=spotlight
  const kiaV2 = await prisma.voiceAgent.upsert({
    where: { slug: "spotlight" },
    update: {
      name: "Kia VoiceAgent v2",
      systemInstructions: KIA_PROMPT,
      isLive: false,  // Test VoiceAgent
      // NOTE: Do NOT overwrite payload templates on update - user may have customized them
      // Templates are only set during initial creation
    },
    create: {
      name: "Kia VoiceAgent v2",
      slug: "spotlight",
      phoneNumber: "+91 9876543210",
      engine: "PRIMARY",
      greeting: "Namaste! Kia Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?",
      accent: "INDIAN",
      language: "HINDI",
      voiceName: "ANANYA",  // Maps to Aoede in Gemini
      isActive: true,
      isLive: false,  // Test VoiceAgent
      systemInstructions: KIA_PROMPT,
      siCustomerName: "LakmeSalon",  // Test environment customer name (change to "Kia" for production)
      siPayloadTemplate: DEFAULT_SI_TEMPLATE,
      siSamplePayload: DEFAULT_SI_SAMPLE,  // Reference sample for correct format
      waybeoPayloadTemplate: DEFAULT_WAYBEO_TEMPLATE,
    },
  });
  console.log("Upserted Kia VoiceAgent v2:", kiaV2.id, "(slug: spotlight, TEST)");
  console.log("  → Data: /data/kia2/ (Gemini Live)");
  console.log("  → SI Customer Name: LakmeSalon (test environment)");

  // Upsert Tata VoiceAgent - TEST
  const tata = await prisma.voiceAgent.upsert({
    where: { slug: "tata" },
    update: {
      systemInstructions: TATA_PROMPT,
      isLive: false,  // Test VoiceAgent
    },
    create: {
      name: "Tata VoiceAgent",
      slug: "tata",
      phoneNumber: "",
      engine: "PRIMARY",
      greeting: "Namaste! Tata Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?",
      accent: "INDIAN",
      language: "HINDI",
      voiceName: "ANANYA",
      isActive: true,
      isLive: false,  // Test VoiceAgent
      systemInstructions: TATA_PROMPT,
      // Payload templates - using same format as Kia v2 for testing
      siPayloadTemplate: DEFAULT_SI_TEMPLATE,
      waybeoPayloadTemplate: DEFAULT_WAYBEO_TEMPLATE,
      siSamplePayload: DEFAULT_SI_SAMPLE,
      waybeoSamplePayload: DEFAULT_WAYBEO_SAMPLE,
      siCustomerName: "LakmeSalon",  // Test customer name (same as Kia v2)
    },
  });
  console.log("Upserted Tata VoiceAgent:", tata.id, "(slug: tata, TEST)");
  console.log("  → Data: /data/tata/ (Gemini Live)");
  console.log("  → SI Payload Template: Configured (matches Kia v2)");

  // Upsert Skoda VoiceAgent - TEST
  const skoda = await prisma.voiceAgent.upsert({
    where: { slug: "skoda" },
    update: {
      systemInstructions: SKODA_PROMPT,
      isLive: false,  // Test VoiceAgent
    },
    create: {
      name: "Skoda VoiceAgent",
      slug: "skoda",
      phoneNumber: "",
      engine: "PRIMARY",
      greeting: "Namaste! Skoda Auto mein aapka swagat hai. Main aapki kya madad kar sakti hoon?",
      accent: "INDIAN",
      language: "HINDI",
      voiceName: "ANANYA",
      isActive: true,
      isLive: false,  // Test VoiceAgent
      systemInstructions: SKODA_PROMPT,
      // Payload templates - using same format as Kia v2 for testing
      siPayloadTemplate: DEFAULT_SI_TEMPLATE,
      waybeoPayloadTemplate: DEFAULT_WAYBEO_TEMPLATE,
      siSamplePayload: DEFAULT_SI_SAMPLE,
      waybeoSamplePayload: DEFAULT_WAYBEO_SAMPLE,
      siCustomerName: "LakmeSalon",  // Test customer name (same as Kia v2)
    },
  });
  console.log("Upserted Skoda VoiceAgent:", skoda.id, "(slug: skoda, TEST)");
  console.log("  → Data: /data/skoda/ (Gemini Live)");
  console.log("  → SI Payload Template: Configured (matches Kia v2)");

  // Add call flow for Kia v1 if it doesn't exist
  const existingCallFlowV1 = await prisma.callFlow.findUnique({
    where: { voiceAgentId: kiaV1.id },
  });

  if (!existingCallFlowV1) {
    await prisma.callFlow.create({
      data: {
        voiceAgentId: kiaV1.id,
        greeting: "Namaste! Kia Motors mein aapka swagat hai.",
        steps: {
          create: [
            { order: 0, title: "Collect Name", content: "Ask for the customer's name in a friendly manner.", enabled: true },
            { order: 1, title: "Identify Interest", content: "Ask which Kia model they're interested in.", enabled: true },
            { order: 2, title: "Test Drive", content: "Offer to schedule a test drive.", enabled: true },
            { order: 3, title: "Collect Email", content: "Ask for email (optional).", enabled: true },
          ],
        },
      },
    });
    console.log("Created call flow for Kia v1");
  }

  // Add call flow for Kia v2 if it doesn't exist
  const existingCallFlowV2 = await prisma.callFlow.findUnique({
    where: { voiceAgentId: kiaV2.id },
  });

  if (!existingCallFlowV2) {
    await prisma.callFlow.create({
      data: {
        voiceAgentId: kiaV2.id,
        greeting: "Namaste! Kia Motors mein aapka swagat hai.",
        steps: {
          create: [
            { order: 0, title: "Collect Name", content: "Ask for the customer's name in a friendly manner.", enabled: true },
            { order: 1, title: "Identify Interest", content: "Ask which Kia model they're interested in.", enabled: true },
            { order: 2, title: "Test Drive", content: "Offer to schedule a test drive.", enabled: true },
            { order: 3, title: "Collect Email", content: "Ask for email (optional).", enabled: true },
          ],
        },
      },
    });
    console.log("Created call flow for Kia v2");
  }

  // Add default guardrails for Kia v1 if none exist
  const existingGuardrailsV1 = await prisma.guardrail.count({
    where: { voiceAgentId: kiaV1.id },
  });

  if (existingGuardrailsV1 === 0) {
    await prisma.guardrail.createMany({
      data: [
        {
          voiceAgentId: kiaV1.id,
          name: "No Competitor Comparisons",
          description: "Avoid comparing Kia cars to competitors",
          ruleText: "Never compare Kia vehicles to competitors. Focus only on Kia's features and benefits.",
          enabled: true,
        },
        {
          voiceAgentId: kiaV1.id,
          name: "No Pricing Commitments",
          description: "Don't commit to specific prices",
          ruleText: "Do not commit to specific prices or discounts. Direct pricing questions to the dealership.",
          enabled: true,
        },
      ],
    });
    console.log("Created guardrails for Kia v1");
  }

  // Add default guardrails for Kia v2 if none exist
  const existingGuardrailsV2 = await prisma.guardrail.count({
    where: { voiceAgentId: kiaV2.id },
  });

  if (existingGuardrailsV2 === 0) {
    await prisma.guardrail.createMany({
      data: [
        {
          voiceAgentId: kiaV2.id,
          name: "No Competitor Comparisons",
          description: "Avoid comparing Kia cars to competitors",
          ruleText: "Never compare Kia vehicles to competitors. Focus only on Kia's features and benefits.",
          enabled: true,
        },
        {
          voiceAgentId: kiaV2.id,
          name: "No Pricing Commitments",
          description: "Don't commit to specific prices",
          ruleText: "Do not commit to specific prices or discounts. Direct pricing questions to the dealership.",
          enabled: true,
        },
      ],
    });
    console.log("Created guardrails for Kia v2");
  }

  // Seed VMN to Store Code mappings for Kia v2 (spotlight)
  const VMN_STORE_CODE_MAP: Record<string, string> = {
    "+919167246028": "GJ311",
    "+918879031998": "GJ510",
    "+918071888810": "10001",
    "+919619792053": "UK401",
    "+919167243969": "UP510",
    "+918879867467": "RJ410",
    "+919619878225": "JK402",
    "+919619884921": "RJ302",
    "+919619952242": "PB308",
    "+919619884788": "PB304",
    "+919167268753": "HR309",
    "+919167245796": "DL407",
    "+918879847565": "DL413",
    "+918291134054": "UP411",
    "+919167235286": "JK401",
    "+918291564122": "HR410",
    "+918291575962": "HR302",
    "+919619920787": "RJ412",
    "+919167207173": "WB306",
    "+919619846477": "WB406",
  };

  console.log("\n📞 Seeding VMN → Store Code mappings for Kia v2...");
  for (const [vmn, storeCode] of Object.entries(VMN_STORE_CODE_MAP)) {
    await prisma.vmnMapping.upsert({
      where: {
        voiceAgentId_vmn: { voiceAgentId: kiaV2.id, vmn },
      },
      update: { storeCode },
      create: {
        voiceAgentId: kiaV2.id,
        vmn,
        storeCode,
        effectiveFrom: new Date(),
      },
    });
  }
  console.log(`  ✅ ${Object.keys(VMN_STORE_CODE_MAP).length} VMN mappings seeded for spotlight`);

  // Seed Car Models for Kia v2 (spotlight)
  const KIA_CAR_MODELS = [
    {
      modelName: "NEW SELTOS",
      pronunciation: "NEW SELL-toss",
      phonetic: "/njuː ˈsɛltɒs/",
      vehicleType: "Mid-SUV",
      displayOrder: 0,
      keyFeatures: `1. Advanced Safety: ADAS Level 2 with 21 Autonomous Features.
2. Tech: Command-Centric Trinity Panoramic Display.
3. Climate: Dual Zone Fully Automatic Air Conditioner.
4. Convenience: Electric Parking Brake with Auto Hold.
5. Audio: Bose Premium Sound System with 8 Speakers.`,
    },
    {
      modelName: "SYROS",
      pronunciation: "SIGH-ross",
      phonetic: "/ˈsaɪrɒs/",
      vehicleType: "New Age SUV",
      displayOrder: 1,
      keyFeatures: `1. Trinity Panoramic Display: 76.20 cm (30") wide screen.
2. Lounge Class Seating: Ventilated seats with reclining options.
3. Advanced Safety: ADAS Level 2 with 16 autonomous features.
4. Design: Digital Tiger Face with Ice Cube LED Headlamps.
5. Comfort: Dual Pane Panoramic Sunroof & Smart Air Purifier.`,
    },
    {
      modelName: "SELTOS",
      pronunciation: "SELL-toss",
      phonetic: "/ˈsɛltɒs/",
      vehicleType: "Mid-SUV",
      displayOrder: 2,
      keyFeatures: `1. Safety: ADAS Level 2 with 19 autonomous features & 15 Standard Safety features.
2. Display: Dual 26.03 cm (10.25") HD Touchscreen & Digital Cluster.
3. Sky: Dual Pane Panoramic Sunroof.
4. Power: Smartstream G1.5 T-GDi Petrol Engine delivering 160 PS.
5. Comfort: Front Ventilated Seats with 8-way Power Driver's Seat.`,
    },
    {
      modelName: "CARENS CLAVIS",
      pronunciation: "KAH-renz KLAH-viss",
      phonetic: "/ˈkɑːrɛnz ˈklɑːvɪs/",
      vehicleType: "Premium MPV",
      displayOrder: 3,
      keyFeatures: `1. Screen: 67.62 cm (26.62") Dual Panoramic Display.
2. Seating: 3-row comfort with Front Ventilated Seats.
3. Safety: ADAS Level 2 with 20 autonomous features.
4. Design: Star Map LED Connected DRLs.
5. Convenience: Infotainment/Climate Switchable Controller.`,
    },
    {
      modelName: "SONET",
      pronunciation: "SAW-net",
      phonetic: "/ˈsɒnɪt/",
      vehicleType: "Compact SUV",
      displayOrder: 4,
      keyFeatures: `1. Safety: 15 Standard Safety features including 6 Airbags.
2. ADAS: Level 1 with 10 autonomous features.
3. Tech: 26.03 cm (10.25") HD Touchscreen Navigation.
4. Comfort: Front Ventilated Seats & Power Driver's Seat.
5. Look: Crown Jewel LED Headlamps with Star Map DRLs.`,
    },
    {
      modelName: "CARENS CLAVIS EV",
      pronunciation: "KAH-renz KLAH-viss EE-VEE",
      phonetic: "/ˈkɑːrɛnz ˈklɑːvɪs iː viː/",
      vehicleType: "Electric MPV",
      displayOrder: 5,
      keyFeatures: `1. Range: Up to 490 km (ARAI Certified).
2. Charging: 10-80% in ~39 mins (DC Fast Charge).
3. Utility: V2L (Vehicle-to-Load) & Frunk storage.
4. Tech: Shift-by-Wire system & Dual Panoramic Display.
5. Safety: ADAS Level 2 & 18 standard safety features.`,
    },
    {
      modelName: "CARENS",
      pronunciation: "KAH-renz",
      phonetic: "/ˈkɑːrɛnz/",
      vehicleType: "Family MPV",
      displayOrder: 6,
      keyFeatures: `1. Safety: 6 Airbags standard across all variants.
2. Versatility: One-Touch Easy Electric Tumble Seat (2nd Row).
3. Tech: 26.03 cm (10.25") HD Navigation with Kia Connect.
4. Comfort: Ventilated Front Seats & Sky Light Sunroof.
5. Ambiance: 64-Color Ambient Lighting.`,
    },
    {
      modelName: "EV6",
      pronunciation: "EE-VEE-SIX",
      phonetic: "/iː viː sɪks/",
      vehicleType: "Premium Electric SUV",
      displayOrder: 7,
      keyFeatures: `1. Speed: 0-100 km/h in 5.3 seconds.
2. Range: Up to 663 km (ARAI MIDC-Full).
3. Charging: Ultra-fast charging (10-80% in 18 mins).
4. Tech: Augmented Reality Head-up Display.
5. Sound: Meridian Premium Sound System (14 speakers).`,
    },
    {
      modelName: "EV9",
      pronunciation: "EE-VEE-NINE",
      phonetic: "/iː viː naɪn/",
      vehicleType: "Premium Electric SUV",
      displayOrder: 8,
      keyFeatures: `1. Capability: AWD with Terrain Modes & 561 km Range.
2. Luxury: 2nd Row Captain Seats with Massage function.
3. Safety: 10 Airbags & ADAS Level 2 (27 features).
4. Innovation: Trinity Panoramic Display.
5. Look: Digital Pattern Lighting Grille.`,
    },
    {
      modelName: "CARNIVAL",
      pronunciation: "KAR-ni-vuhl",
      phonetic: "/ˈkɑːrnɪvəl/",
      vehicleType: "Premium MPV",
      displayOrder: 9,
      keyFeatures: `1. Luxury Seating: 2nd-row Powered Relaxation Seats (Ventilated/Heated).
2. Tech: 31.24 cm (12.3") Curved Dual Panoramic Display.
3. Safety: ADAS Level 2 (23 features) & 8 Airbags.
4. Comfort: Wide Electric Dual Sunroof.
5. Power: 2.2L Diesel Engine with 8-speed Auto.`,
    },
  ];

  console.log("\n🚗 Seeding Car Models for Kia v2...");
  for (const model of KIA_CAR_MODELS) {
    await prisma.carModel.upsert({
      where: {
        voiceAgentId_modelName: { voiceAgentId: kiaV2.id, modelName: model.modelName },
      },
      update: {
        pronunciation: model.pronunciation,
        phonetic: model.phonetic,
        vehicleType: model.vehicleType,
        keyFeatures: model.keyFeatures,
        displayOrder: model.displayOrder,
        isActive: true,
      },
      create: {
        voiceAgentId: kiaV2.id,
        modelName: model.modelName,
        pronunciation: model.pronunciation,
        phonetic: model.phonetic,
        vehicleType: model.vehicleType,
        keyFeatures: model.keyFeatures,
        displayOrder: model.displayOrder,
        isActive: true,
      },
    });
  }
  console.log(`  ✅ ${KIA_CAR_MODELS.length} car models seeded for spotlight`);

  // Create/update user accounts
  console.log("\n📝 Creating user accounts...");
  for (const userData of USERS) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        customerSlug: userData.customerSlug,
      },
      create: {
        username: userData.username,
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        customerSlug: userData.customerSlug,
      },
    });
    console.log(`  ✅ ${userData.username} (${userData.role}, ${userData.customerSlug}): ${user.id}`);
  }

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
