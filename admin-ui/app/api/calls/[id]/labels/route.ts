import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * POST /api/calls/[id]/labels
 * 
 * Submit human label corrections for extracted data fields
 * 
 * Body:
 * {
 *   labels: [
 *     {
 *       fieldName: "name" | "model" | "email" | "test_drive",
 *       fieldLabel: "Customer Name",
 *       originalValue: "what AI extracted",
 *       correctedValue: "what it should be",
 *       correctionReason: "misheard" | "pronunciation issue" | "other",
 *       isCorrect: false,
 *       attemptNumber: 1,
 *       audioSnippet: "transcript snippet",
 *       userUtterance: "exact user words",
 *       notes: "additional notes"
 *     }
 *   ],
 *   labeledBy: "user@example.com"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const callSessionId = params.id;
    const body = await request.json();
    const { labels, labeledBy } = body;

    if (!labels || !Array.isArray(labels) || labels.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid labels array" },
        { status: 400 }
      );
    }

    if (!labeledBy) {
      return NextResponse.json(
        { error: "Missing labeledBy field" },
        { status: 400 }
      );
    }

    // Fetch call session to get voiceAgentId
    const callSession = await prisma.callSession.findUnique({
      where: { id: callSessionId },
      select: { id: true, voiceAgentId: true },
    });

    if (!callSession) {
      return NextResponse.json(
        { error: "Call session not found" },
        { status: 404 }
      );
    }

    // Create data labels
    const createdLabels = await Promise.all(
      labels.map((label: any) =>
        prisma.dataLabel.create({
          data: {
            callSessionId,
            voiceAgentId: callSession.voiceAgentId,
            fieldName: label.fieldName,
            fieldLabel: label.fieldLabel || null,
            originalValue: label.originalValue || null,
            originalConfidence: label.originalConfidence
              ? new Prisma.Decimal(label.originalConfidence)
              : null,
            correctedValue: label.correctedValue,
            correctionReason: label.correctionReason || null,
            audioSnippet: label.audioSnippet || null,
            userUtterance: label.userUtterance || null,
            isCorrect: label.isCorrect !== undefined ? label.isCorrect : false,
            attemptNumber: label.attemptNumber || null,
            labeledBy,
            notes: label.notes || null,
          },
        })
      )
    );

    // Update call session review status to REVIEWED
    await prisma.callSession.update({
      where: { id: callSessionId },
      data: {
        reviewStatus: "REVIEWED",
        reviewedAt: new Date(),
        reviewedBy: labeledBy,
      },
    });

    console.log(`[Labels API] Created ${createdLabels.length} labels for call ${callSessionId}`);

    return NextResponse.json({
      success: true,
      labels: createdLabels,
      message: `Successfully created ${createdLabels.length} label(s)`,
    });
  } catch (error) {
    console.error("[Labels API] Error creating labels:", error);
    return NextResponse.json(
      { error: "Failed to create labels" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/[id]/labels
 * 
 * Fetch all human labels for a specific call
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const callSessionId = params.id;

    const labels = await prisma.dataLabel.findMany({
      where: { callSessionId },
      include: {
        voiceAgent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { labeledAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      labels,
    });
  } catch (error) {
    console.error("[Labels API] Error fetching labels:", error);
    return NextResponse.json(
      { error: "Failed to fetch labels" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calls/[id]/labels/[labelId]
 * 
 * Delete a specific label (if correction was wrong)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const labelId = searchParams.get("labelId");

    if (!labelId) {
      return NextResponse.json(
        { error: "Missing labelId parameter" },
        { status: 400 }
      );
    }

    await prisma.dataLabel.delete({
      where: { id: labelId },
    });

    console.log(`[Labels API] Deleted label ${labelId}`);

    return NextResponse.json({
      success: true,
      message: "Label deleted successfully",
    });
  } catch (error) {
    console.error("[Labels API] Error deleting label:", error);
    return NextResponse.json(
      { error: "Failed to delete label" },
      { status: 500 }
    );
  }
}
