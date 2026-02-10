import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public API endpoint for telephony service to fetch system instructions by agent slug.
 * 
 * GET /api/telephony/prompt/spotlight
 * GET /api/telephony/prompt/tata
 * GET /api/telephony/prompt/skoda
 * 
 * Returns: { systemInstructions: string, voiceName: string, greeting: string, ... }
 * 
 * This endpoint is called by the Python telephony service when a new call connects.
 * It does NOT require authentication (telephony service runs on same VM).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const agent = await prisma.voiceAgent.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        greeting: true,
        accent: true,
        language: true,
        voiceName: true,
        systemInstructions: true,
        isActive: true,
        // Fetch enabled guardrails to inject into system instructions
        guardrails: {
          where: { enabled: true },
          select: { name: true, ruleText: true },
          orderBy: { createdAt: "asc" },
        },
        // Fetch active car models for injection into system instructions
        carModels: {
          where: { isActive: true },
          select: {
            modelName: true,
            pronunciation: true,
            phonetic: true,
            vehicleType: true,
            keyFeatures: true,
          },
          orderBy: { displayOrder: "asc" },
        },
        // Payload templates and webhook endpoints for post-call delivery
        siPayloadTemplate: true,
        waybeoPayloadTemplate: true,
        siCustomerName: true,
        siEndpointUrl: true,
        siAuthHeader: true,
        waybeoEndpointUrl: true,
        waybeoAuthHeader: true,
        // VMN to Store Code mappings
        vmnMappings: {
          select: { vmn: true, storeCode: true, effectiveFrom: true },
          orderBy: { effectiveFrom: "desc" as const },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: `Agent not found: ${params.slug}` },
        { status: 404 }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { error: `Agent is inactive: ${params.slug}` },
        { status: 403 }
      );
    }

    // Map internal voice names to Gemini voice names
    const voiceNameMap: Record<string, string> = {
      ANANYA: "Aoede",
      PRIYA: "Puck",
      CHITRA: "Charon",
      KAVYA: "Kore",
      FARHAN: "Fenrir",
    };

    // Build full system instructions with dynamic injections
    let fullInstructions = agent.systemInstructions || "";

    // 1. Inject current date context at the top
    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    fullInstructions = `[Current Date: ${today}. Use this date for all time references. Current year is ${new Date().getFullYear()}.]\n\n` + fullInstructions;

    // 2. Inject car models with pronunciations and features
    if (agent.carModels && agent.carModels.length > 0) {
      const modelNames = agent.carModels.map((m) => m.modelName).join(", ");

      // Pronunciation guide
      const pronunciationLines = agent.carModels
        .filter((m) => m.pronunciation)
        .map((m) => `- ${m.modelName}: pronounce as "${m.pronunciation}"${m.phonetic ? ` ${m.phonetic}` : ""}`)
        .join("\n");

      // Features section
      const featureLines = agent.carModels
        .filter((m) => m.keyFeatures)
        .map((m) => {
          const typeLabel = m.vehicleType ? ` (${m.vehicleType})` : "";
          return `${m.modelName}${typeLabel}:\n${m.keyFeatures}`;
        })
        .join("\n\n");

      let carModelSection = `\n\n--- AVAILABLE CAR MODELS ---`;
      carModelSection += `\nYou MUST use these exact model names. These are the ONLY models currently available.`;
      carModelSection += `\nSupported Models: ${modelNames}`;

      if (pronunciationLines) {
        carModelSection += `\n\nPronunciation Guide (use these exact pronunciations when speaking model names):`;
        carModelSection += `\n${pronunciationLines}`;
      }

      if (featureLines) {
        carModelSection += `\n\n--- CAR MODEL FEATURES (Share ONLY when customer asks about a specific model) ---`;
        carModelSection += `\nIMPORTANT: Do NOT volunteer feature information unprompted. Only share 1-2 relevant features per turn when asked.`;
        carModelSection += `\n\n${featureLines}`;
        carModelSection += `\n--- END FEATURES ---`;
      }

      carModelSection += `\n--- END CAR MODELS ---`;
      fullInstructions += carModelSection;
    }

    // 3. Inject enabled guardrails
    if (agent.guardrails && agent.guardrails.length > 0) {
      const guardrailRules = agent.guardrails
        .map((g, i) => `${i + 1}. ${g.name}: ${g.ruleText}`)
        .join("\n");
      fullInstructions += `\n\n--- MANDATORY GUARDRAILS ---\nYou MUST follow these guardrails strictly at all times. These are non-negotiable rules:\n${guardrailRules}\n--- END GUARDRAILS ---`;
    }

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      greeting: agent.greeting,
      accent: agent.accent,
      language: agent.language,
      voiceName: agent.voiceName,
      geminiVoice: voiceNameMap[agent.voiceName] || "Aoede",
      systemInstructions: fullInstructions,
      // Payload templates
      siPayloadTemplate: agent.siPayloadTemplate,
      waybeoPayloadTemplate: agent.waybeoPayloadTemplate,
      // Webhook endpoints for post-call delivery
      siCustomerName: agent.siCustomerName || null,
      siEndpointUrl: agent.siEndpointUrl || null,
      siAuthHeader: agent.siAuthHeader || null,
      waybeoEndpointUrl: agent.waybeoEndpointUrl || null,
      waybeoAuthHeader: agent.waybeoAuthHeader || null,
      // VMN to Store Code mapping (used by telephony to derive store_code from VMN)
      vmnMappings: (agent.vmnMappings || []).reduce(
        (acc: Record<string, string>, m: { vmn: string; storeCode: string }) => {
          acc[m.vmn] = m.storeCode;
          return acc;
        },
        {} as Record<string, string>
      ),
    });
  } catch (error) {
    console.error("Error fetching agent prompt:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
