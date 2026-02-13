// ============================================================================
// VA2withUI Seed Template for Custom Deployments
// ============================================================================
//
// This template provides a starting point for seeding your database.
//
// INSTRUCTIONS:
// 1. Update USER configuration with customer-specific details
// 2. Customize VOICE_AGENTS with your agents
// 3. Add seed data for your custom domain models
// 4. Run: npx prisma db seed
//
// ============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// ============================================================================
// CONFIGURATION - CUSTOMIZE THESE VALUES
// ============================================================================

// TODO: Update with customer-specific information
const CUSTOMER_CONFIG = {
  name: "CUSTOMER_NAME", // e.g., "RxOne Healthcare", "Acme Corp"
  slug: "CUSTOMER_SLUG", // e.g., "rxone", "acme"
  domain: "CUSTOMER_DOMAIN", // e.g., "rxone.healthcare", "acme.com"
};

// User accounts - Update with customer-specific credentials
const USERS = [
  {
    username: "admin",
    password: "OneView01!", // TODO: Change default password
    name: "Admin User",
    email: `admin@${CUSTOMER_CONFIG.domain}`,
    role: "ADMIN" as const,
    customerSlug: CUSTOMER_CONFIG.slug,
  },
  {
    username: "user",
    password: "VoiceAgent01!", // TODO: Change default password
    name: `${CUSTOMER_CONFIG.name} User`,
    email: `user@${CUSTOMER_CONFIG.domain}`,
    role: "USER" as const,
    customerSlug: CUSTOMER_CONFIG.slug,
  },
];

// ============================================================================
// VOICE AGENTS - CUSTOMIZE FOR YOUR DEPLOYMENT
// ============================================================================

// TODO: Define your voice agents
// Each voice agent represents a specific use case or location
const VOICE_AGENTS = [
  {
    name: "AGENT_NAME", // e.g., "Artemis Hospital", "Downtown Showroom"
    slug: "AGENT_SLUG", // e.g., "artemis", "downtown"
    phoneNumber: "", // Optional: e.g., "+919876543210"
    engine: "PRIMARY" as const,
    greeting: "Namaskar, welcome to [YOUR_COMPANY]. How may I help you today?",
    accent: "INDIAN" as const,
    language: "ENGLISH" as const,
    voiceName: "ANANYA" as const,
    isActive: true,
    isLive: false, // Set to true for production
    systemInstructions: `
Agent Name: AGENT_NAME
Voice: ANANYA (female voice)
Role: [DESCRIBE ROLE - e.g., "Customer service representative"]
Purpose: [DESCRIBE PURPOSE - e.g., "Assist with product inquiries and bookings"]

Critical Features:
1. INDIAN ACCENT (MANDATORY)
2. LANGUAGE SUPPORT (ENGLISH/HINDI)
3. GREETING & INITIAL FLOW
4. [ADD YOUR SPECIFIC FEATURES]

Key Personality Traits:
- Demeanor: Respectful, empathetic, supportive
- Tone: Soft, warm, conversational
- Accent: Distinct Indian
    `.trim(),
  },
  // TODO: Add more agents as needed
  // {
  //   name: "Agent 2",
  //   slug: "agent2",
  //   ...
  // },
];

// ============================================================================
// DOMAIN-SPECIFIC SEED DATA
// ============================================================================

// TODO: Add seed data for your custom models
// Examples provided below - uncomment and customize

// Example 1: Product Catalog (for e-commerce)
// const PRODUCTS = [
//   {
//     productName: "Premium Product",
//     sku: "PROD-001",
//     category: "Electronics",
//     price: 299.99,
//     stock: 50,
//     description: "High-quality product description",
//     features: "- Feature 1\n- Feature 2\n- Feature 3",
//   },
//   // Add more products...
// ];

// Example 2: Doctor Profiles (for healthcare)
// const DOCTOR_PROFILES = [
//   {
//     doctorName: "Dr. Seema Dhir",
//     pronunciation: "Dr. SEE-ma DEER",
//     specialization: "Internal Medicine",
//     qualifications: "MBBS, MD - 20+ years experience",
//     displayOrder: 0,
//   },
//   // Add more doctors...
// ];

// Example 3: Room Types (for hospitality)
// const ROOM_TYPES = [
//   {
//     roomCategory: "Deluxe Suite",
//     bedConfiguration: "King Bed",
//     amenities: "Ocean view, Private balcony, Mini bar",
//     pricePerNight: 250.00,
//     capacity: 2,
//   },
//   // Add more room types...
// ];

// Example 4: Phone Routing / Location Mapping
// const PHONE_ROUTING = [
//   {
//     phoneNumber: "+919167246028",
//     locationCode: "LOCATION_001", // e.g., "ARTEMIS_GGN", "STORE_NY"
//   },
//   // Add more phone mappings...
// ];

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  console.log("🌱 Starting seed...\n");

  // ---------------------------------------------------------------------------
  // 1. SEED USERS
  // ---------------------------------------------------------------------------
  console.log("📝 Creating user accounts...");
  
  for (const userData of USERS) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {
        name: userData.name,
        email: userData.email,
        role: userData.role,
        customerSlug: userData.customerSlug,
      },
      create: {
        username: userData.username,
        password: passwordHash,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        customerSlug: userData.customerSlug,
      },
    });
    
    console.log(`  ✅ ${user.username} (${user.role}, ${user.customerSlug}): ${user.id}`);
  }

  // Get admin user for voice agent creation
  const adminUser = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!adminUser) {
    throw new Error("Admin user not found");
  }

  // ---------------------------------------------------------------------------
  // 2. SEED VOICE AGENTS
  // ---------------------------------------------------------------------------
  console.log("\n🎙️ Creating voice agents...");

  for (const agentData of VOICE_AGENTS) {
    const agent = await prisma.voiceAgent.upsert({
      where: { slug: agentData.slug },
      update: {
        name: agentData.name,
        phoneNumber: agentData.phoneNumber,
        greeting: agentData.greeting,
        systemInstructions: agentData.systemInstructions,
        isActive: agentData.isActive,
        isLive: agentData.isLive,
      },
      create: {
        name: agentData.name,
        slug: agentData.slug,
        phoneNumber: agentData.phoneNumber,
        engine: agentData.engine,
        greeting: agentData.greeting,
        accent: agentData.accent,
        language: agentData.language,
        voiceName: agentData.voiceName,
        isActive: agentData.isActive,
        isLive: agentData.isLive,
        systemInstructions: agentData.systemInstructions,
      },
    });

    console.log(`  ✅ ${agent.name} (${agent.slug}): ${agent.id}`);
    console.log(`     → Language: ${agent.language}, Voice: ${agent.voiceName}`);
    console.log(`     → Status: ${agent.isLive ? "LIVE" : "TEST"}`);

    // ---------------------------------------------------------------------------
    // 3. SEED DOMAIN-SPECIFIC DATA FOR THIS AGENT
    // ---------------------------------------------------------------------------
    
    // TODO: Uncomment and customize based on your domain
    
    // Example 1: Seed Products (for e-commerce)
    // if (typeof PRODUCTS !== 'undefined') {
    //   console.log(`\n  📦 Seeding products for ${agent.name}...`);
    //   for (const productData of PRODUCTS) {
    //     await prisma.product.upsert({
    //       where: {
    //         voiceAgentId_sku: {
    //           voiceAgentId: agent.id,
    //           sku: productData.sku,
    //         },
    //       },
    //       update: { ...productData },
    //       create: {
    //         voiceAgentId: agent.id,
    //         ...productData,
    //       },
    //     });
    //   }
    //   console.log(`  ✅ ${PRODUCTS.length} products seeded`);
    // }

    // Example 2: Seed Doctor Profiles (for healthcare)
    // if (typeof DOCTOR_PROFILES !== 'undefined') {
    //   console.log(`\n  👨‍⚕️ Seeding doctor profiles for ${agent.name}...`);
    //   for (const doctorData of DOCTOR_PROFILES) {
    //     await prisma.doctorProfile.upsert({
    //       where: {
    //         voiceAgentId_doctorName: {
    //           voiceAgentId: agent.id,
    //           doctorName: doctorData.doctorName,
    //         },
    //       },
    //       update: { ...doctorData },
    //       create: {
    //         voiceAgentId: agent.id,
    //         ...doctorData,
    //       },
    //     });
    //   }
    //   console.log(`  ✅ ${DOCTOR_PROFILES.length} doctor profiles seeded`);
    // }

    // Example 3: Seed Phone Routing (for multi-location businesses)
    // if (typeof PHONE_ROUTING !== 'undefined') {
    //   console.log(`\n  📞 Seeding phone routing for ${agent.name}...`);
    //   for (const routingData of PHONE_ROUTING) {
    //     await prisma.phoneRouting.upsert({
    //       where: {
    //         voiceAgentId_phoneNumber: {
    //           voiceAgentId: agent.id,
    //           phoneNumber: routingData.phoneNumber,
    //         },
    //       },
    //       update: { locationCode: routingData.locationCode },
    //       create: {
    //         voiceAgentId: agent.id,
    //         phoneNumber: routingData.phoneNumber,
    //         locationCode: routingData.locationCode,
    //       },
    //     });
    //   }
    //   console.log(`  ✅ ${PHONE_ROUTING.length} phone routes seeded`);
    // }
  }

  // ---------------------------------------------------------------------------
  // 4. SEED ADDITIONAL CUSTOM DATA (NOT AGENT-SPECIFIC)
  // ---------------------------------------------------------------------------
  
  // TODO: Add any global seed data here (not tied to specific agents)
  // Examples:
  // - Global configuration settings
  // - Master data / lookup tables
  // - System defaults

  console.log("\n✅ Seed completed successfully!");
  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary:");
  console.log("=".repeat(50));
  console.log(`Users created: ${USERS.length}`);
  console.log(`Voice agents created: ${VOICE_AGENTS.length}`);
  console.log(`Customer: ${CUSTOMER_CONFIG.name} (${CUSTOMER_CONFIG.slug})`);
  console.log("=".repeat(50));
  console.log("\n🎯 Next steps:");
  console.log("  1. Update voice agent system instructions via Admin UI");
  console.log("  2. Add domain-specific data (products, services, etc.)");
  console.log("  3. Test voice agents in TEST mode before going LIVE");
  console.log("  4. Configure phone routing and webhooks");
}

// ============================================================================
// EXECUTE SEED
// ============================================================================

main()
  .catch((e) => {
    console.error("❌ Seed failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
