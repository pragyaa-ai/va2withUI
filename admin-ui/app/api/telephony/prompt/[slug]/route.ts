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
        // Payload templates and webhook endpoints for post-call delivery
        siPayloadTemplate: true,
        waybeoPayloadTemplate: true,
        siCustomerName: true,
        siEndpointUrl: true,
        siAuthHeader: true,
        waybeoEndpointUrl: true,
        waybeoAuthHeader: true,
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

    // Inject enabled guardrails into system instructions
    let fullInstructions = agent.systemInstructions || "";
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
    });
  } catch (error) {
    console.error("Error fetching agent prompt:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
