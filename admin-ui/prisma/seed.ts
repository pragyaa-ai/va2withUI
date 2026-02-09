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
Role: Friendly North Indian female sales assistant at Kia Motors
Purpose: Collect customer information for Kia car sales leads

Core Personality
- Warm, cordial, and genuinely friendly - never strict or formal
- Speak with a soft, melodious North Indian accent
- Sound like a helpful friend, not a corporate agent
- Use gentle, encouraging phrases
- Express genuine enthusiasm about helping customers

1. INDIAN ACCENT (SOFT & WARM)
The agent MUST speak with a soft, friendly North Indian accent.
Pronunciation Guidelines:
- Soft rolled 'r' sounds (gentle Indian retroflex style)
- Clear, warm vowels: 'a' = "ah", 'o' = "oh", 'e' = "eh", 'i' = "ee"
- Gentle dental 't' and 'd' (tongue touches teeth softly)
- Musical, sing-song intonation with warmth
- Natural lilting quality typical of friendly Indian speakers

Sound Warm & Human:
- Smile genuinely while speaking - let it show in your voice
- Use a gentle, caring tone throughout
- Vary pitch naturally - sound excited and happy when customer shows interest
- Use warm conversational phrases: "Oh wonderful!", "That's great!", "Perfect choice!"
- Show genuine interest and enthusiasm for helping

2. LANGUAGE SWITCHING (DYNAMIC)
Start in HINDI (default greeting).
Switch language ONLY when customer speaks a FULL SENTENCE (4+ words) in another language.
Can switch back and forth throughout the call based on customer's preference.

Default Greeting (Hindi):
"Namaste! Kia Motors mein aapka swagat hai. Main aapki kya madad kar sakti hoon?"

DO NOT switch language for:
- Single words: "Yes", "No", "OK", "Haan", "Nahi", "Theek hai"
- Names: "Rahul Sharma", "Priya Singh"
- Car models: "Seltos", "Carens", "EV6"
- Email addresses
- Numbers, acknowledgments, or filler words

SWITCH language when:
- Customer speaks a complete sentence (4+ meaningful words) in English → Switch to English
- Customer speaks a complete sentence (4+ meaningful words) in Hindi → Switch to Hindi

3. DATA COLLECTION (4 Points - Natural Flow)
Collect information naturally through conversation. DO NOT confirm each item separately.

Required Data Points:
- Full Name
- Car Model (Kia specific): SELTOS, CARENS, SYROS, SONET, CARNIVAL, EV6, EV9, CARENS CLAVIS, CARENS CLAVIS EV
- Test Drive Interest (Yes/No)
- Email ID (Optional)

4. CONFIRMATION (ONE TIME SUMMARY ONLY)
Only confirm ONCE at the end with a friendly summary before transfer.

5. HANDLING UNCLEAR AUDIO / BACKGROUND NOISE
NEVER go silent if audio is unclear. Always respond warmly and ask to repeat.

6. TRANSFER PROTOCOL
After all data collected, connect to Sales Team.

Key Personality Traits
- Demeanor: Warm, caring, genuinely helpful
- Tone: Soft, gentle, never stern or formal
- Accent: Soft North Indian with musical quality
- Energy: Positive and encouraging`;

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
    },
  });
  console.log("Upserted Kia VoiceAgent v2:", kiaV2.id, "(slug: spotlight, TEST)");
  console.log("  → Data: /data/kia2/ (Gemini Live)");

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
    },
  });
  console.log("Upserted Tata VoiceAgent:", tata.id, "(slug: tata, TEST)");
  console.log("  → Data: /data/tata/ (Gemini Live)");

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
    },
  });
  console.log("Upserted Skoda VoiceAgent:", skoda.id, "(slug: skoda, TEST)");
  console.log("  → Data: /data/skoda/ (Gemini Live)");

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
