import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo users - replace with actual customer users
const DEMO_USERS = [
  {
    username: "admin",
    password: "Admin123!",
    name: "Admin User",
    email: "admin@example.com",
    role: "ADMIN" as const,
    customerSlug: "default",
  },
  {
    username: "user",
    password: "User123!",
    name: "Demo User",
    email: "user@example.com",
    role: "USER" as const,
    customerSlug: "default",
  },
];

// Demo system instructions template
const DEMO_SALES_PROMPT = `Agent Overview
Agent Name: Sales Assistant
Voice: Professional, friendly
Role: Sales lead qualification assistant
Purpose: Collect customer information for sales follow-up

Core Personality
- Warm, cordial, and genuinely friendly
- Professional yet approachable tone
- Sound like a helpful assistant
- Use encouraging phrases
- Express genuine enthusiasm about helping customers

1. VOICE & TONE
The agent should speak with a clear, professional voice.

Sound Warm & Human:
- Smile genuinely while speaking
- Use a gentle, caring tone throughout
- Vary pitch naturally - sound excited when customer shows interest
- Use warm conversational phrases: "That's wonderful!", "Great choice!", "I'd be happy to help!"

2. LANGUAGE
Start in English (default).
Adapt to the language the customer prefers.

Default Greeting:
"Hello! Welcome, and thank you for calling. How can I assist you today?"

3. DATA COLLECTION (Natural Flow)
Collect information naturally through conversation.

Required Data Points:
- Full Name
- Product/Service Interest
- Contact Preference
- Email ID (Optional)

4. CONFIRMATION
Only confirm ONCE at the end with a friendly summary.

5. HANDLING UNCLEAR AUDIO
NEVER go silent if audio is unclear. Always respond warmly and ask to repeat.

6. TRANSFER PROTOCOL
After all data collected, connect to the appropriate team.

Key Personality Traits
- Demeanor: Warm, caring, genuinely helpful
- Tone: Professional yet friendly
- Energy: Positive and encouraging`;

const DEMO_SUPPORT_PROMPT = `Agent Overview
Agent Name: Support Assistant
Voice: Calm, reassuring
Role: Customer support assistant
Purpose: Handle support inquiries and route to appropriate team

Core Personality
- Patient and understanding
- Clear and concise communication
- Solution-oriented approach
- Empathetic to customer concerns

1. VOICE & TONE
Speak with a calm, reassuring voice.

2. LANGUAGE
Start in English (default).
Adapt to customer's preferred language.

Default Greeting:
"Hello! Thank you for calling support. How may I assist you today?"

3. ISSUE COLLECTION
Gather information about the customer's issue:
- Name
- Issue Description
- Account/Reference Number (if applicable)
- Urgency Level

4. RESOLUTION PATH
- For simple issues: Provide immediate assistance
- For complex issues: Collect details and escalate

5. HANDLING UNCLEAR AUDIO
Always politely ask for clarification if needed.

Key Personality Traits
- Demeanor: Patient, understanding
- Tone: Calm, reassuring
- Energy: Focused and helpful`;

async function main() {
  console.log("🌱 Starting database seed...\n");

  // Demo Sales VoiceAgent
  const demoSales = await prisma.voiceAgent.upsert({
    where: { slug: "demo-sales" },
    update: {
      name: "Demo Sales Agent",
      systemInstructions: DEMO_SALES_PROMPT,
      isLive: false,
    },
    create: {
      name: "Demo Sales Agent",
      slug: "demo-sales",
      phoneNumber: "+1 (555) 000-0001",
      engine: "PRIMARY",
      greeting: "Hello! Welcome, and thank you for calling. How can I assist you today?",
      accent: "AMERICAN",
      language: "ENGLISH",
      voiceName: "PRIYA",
      isActive: true,
      isLive: false,  // Test VoiceAgent
      systemInstructions: DEMO_SALES_PROMPT,
    },
  });
  console.log("✓ Upserted Demo Sales Agent:", demoSales.id, "(slug: demo-sales, TEST)");

  // Demo Support VoiceAgent
  const demoSupport = await prisma.voiceAgent.upsert({
    where: { slug: "demo-support" },
    update: {
      name: "Demo Support Agent",
      systemInstructions: DEMO_SUPPORT_PROMPT,
      isLive: false,
    },
    create: {
      name: "Demo Support Agent",
      slug: "demo-support",
      phoneNumber: "+1 (555) 000-0002",
      engine: "PRIMARY",
      greeting: "Hello! Thank you for calling support. How may I assist you today?",
      accent: "AMERICAN",
      language: "ENGLISH",
      voiceName: "KAVYA",
      isActive: true,
      isLive: false,  // Test VoiceAgent
      systemInstructions: DEMO_SUPPORT_PROMPT,
    },
  });
  console.log("✓ Upserted Demo Support Agent:", demoSupport.id, "(slug: demo-support, TEST)");

  // Add call flow for Demo Sales if it doesn't exist
  const existingCallFlow = await prisma.callFlow.findUnique({
    where: { voiceAgentId: demoSales.id },
  });

  if (!existingCallFlow) {
    await prisma.callFlow.create({
      data: {
        voiceAgentId: demoSales.id,
        greeting: "Hello! Welcome, and thank you for calling.",
        steps: {
          create: [
            { order: 0, title: "Collect Name", content: "Ask for the customer's name in a friendly manner.", enabled: true },
            { order: 1, title: "Identify Interest", content: "Ask what product or service they're interested in.", enabled: true },
            { order: 2, title: "Contact Preference", content: "Ask for their preferred contact method.", enabled: true },
            { order: 3, title: "Collect Email", content: "Ask for email (optional).", enabled: true },
          ],
        },
      },
    });
    console.log("✓ Created call flow for Demo Sales");
  }

  // Add default guardrails for Demo Sales if none exist
  const existingGuardrails = await prisma.guardrail.count({
    where: { voiceAgentId: demoSales.id },
  });

  if (existingGuardrails === 0) {
    await prisma.guardrail.createMany({
      data: [
        {
          voiceAgentId: demoSales.id,
          name: "Stay On Topic",
          description: "Keep conversation focused on business topics",
          ruleText: "Keep the conversation focused on the product/service. Politely redirect off-topic discussions.",
          enabled: true,
        },
        {
          voiceAgentId: demoSales.id,
          name: "No Price Commitments",
          description: "Don't commit to specific prices",
          ruleText: "Do not commit to specific prices or discounts. Direct pricing questions to the sales team.",
          enabled: true,
        },
      ],
    });
    console.log("✓ Created guardrails for Demo Sales");
  }

  // Create/update user accounts
  console.log("\n📝 Creating user accounts...");
  for (const userData of DEMO_USERS) {
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
    console.log(`  ✓ ${userData.username} (${userData.role}): ${user.id}`);
  }

  console.log("\n✅ Seed completed successfully!");
  console.log("\n📋 Demo Credentials:");
  console.log("   Admin: admin / Admin123!");
  console.log("   User:  user / User123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
