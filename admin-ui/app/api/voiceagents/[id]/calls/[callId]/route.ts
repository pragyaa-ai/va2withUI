import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/voiceagents/[id]/calls/[callId]
 * Get single call detail with full transcript and payload
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    // Try to find by internal ID first, then by external callId
    let call = await prisma.callSession.findFirst({
      where: {
        voiceAgentId: params.id,
        OR: [
          { id: params.callId },
          { callId: params.callId },
        ],
      },
    });

    if (!call) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(call);
  } catch (error) {
    console.error("Error fetching call:", error);
    return NextResponse.json(
      { error: "Failed to fetch call" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/voiceagents/[id]/calls/[callId]
 * Update call with sentiment, summary, etc.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    const body = await request.json();
    
    // Find the call first
    const existing = await prisma.callSession.findFirst({
      where: {
        voiceAgentId: params.id,
        OR: [
          { id: params.callId },
          { callId: params.callId },
        ],
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Call not found" },
        { status: 404 }
      );
    }

    // Update allowed fields
    const updated = await prisma.callSession.update({
      where: { id: existing.id },
      data: {
        summary: body.summary,
        sentiment: body.sentiment,
        sentimentScore: body.sentimentScore,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating call:", error);
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }
}
