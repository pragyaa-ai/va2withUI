import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/voiceagents/by-slug/:slug
 * 
 * Public endpoint for telephony service to fetch VoiceAgent config by slug.
 * Returns system instructions and key settings needed for call handling.
 * 
 * Example: GET /api/voiceagents/by-slug/spotlight
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const agent = await prisma.voiceAgent.findUnique({
      where: { slug: params.slug.toLowerCase() },
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
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "VoiceAgent not found", slug: params.slug },
        { status: 404 }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { error: "VoiceAgent is inactive", slug: params.slug },
        { status: 403 }
      );
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error("Error fetching VoiceAgent by slug:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
