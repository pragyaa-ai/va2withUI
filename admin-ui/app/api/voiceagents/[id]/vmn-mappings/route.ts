import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVmnMappingSchema } from "@/lib/validation";

/**
 * GET /api/voiceagents/[id]/vmn-mappings
 * List all VMN to Store Code mappings for this voice agent
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const mappings = await prisma.vmnMapping.findMany({
      where: { voiceAgentId: params.id },
      orderBy: { effectiveFrom: "desc" },
    });
    return NextResponse.json(mappings);
  } catch (error) {
    console.error("Error fetching VMN mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch VMN mappings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/voiceagents/[id]/vmn-mappings
 * Create a new VMN to Store Code mapping
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const data = createVmnMappingSchema.parse(body);

    // Ensure VMN starts with +
    const vmn = data.vmn.startsWith("+") ? data.vmn : `+${data.vmn}`;

    const mapping = await prisma.vmnMapping.create({
      data: {
        voiceAgentId: params.id,
        vmn,
        storeCode: data.storeCode,
        effectiveFrom: new Date(),
      },
    });

    // Clear telephony cache to make new VMN mapping effective immediately
    const voiceAgent = await prisma.voiceAgent.findUnique({
      where: { id: params.id },
      select: { slug: true },
    });
    
    if (voiceAgent) {
      const telephonyAdminUrl = process.env.TELEPHONY_ADMIN_URL || "http://localhost:8082";
      try {
        const cacheResponse = await fetch(`${telephonyAdminUrl}/cache/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: voiceAgent.slug }),
        });
        
        if (cacheResponse.ok) {
          console.log(`[POST vmn-mappings] ✅ Telephony cache cleared for agent: ${voiceAgent.slug}`);
        } else {
          console.warn(`[POST vmn-mappings] ⚠️ Failed to clear telephony cache: HTTP ${cacheResponse.status}`);
        }
      } catch (cacheError) {
        // Non-fatal: Log warning but don't fail the update
        console.warn(`[POST vmn-mappings] ⚠️ Telephony cache clear error:`, cacheError);
      }
    }

    return NextResponse.json(mapping, { status: 201 });
  } catch (err: unknown) {
    // Handle unique constraint violation (duplicate VMN for this agent)
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This VMN is already mapped for this voice agent" },
        { status: 409 }
      );
    }

    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
