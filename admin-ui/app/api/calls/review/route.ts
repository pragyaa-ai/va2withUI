import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/calls/review
 * 
 * Fetches calls that need human review based on quality criteria:
 * - Low confidence extractions
 * - Multiple attempts needed
 * - Incomplete data capture
 * - Marked for manual review
 * 
 * Query Parameters:
 * - voiceAgentId: Filter by specific voice agent (optional)
 * - status: Filter by review status (PENDING | IN_REVIEW | REVIEWED) (optional)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const voiceAgentId = searchParams.get("voiceAgentId") || undefined;
    const status = searchParams.get("status") as "PENDING" | "IN_REVIEW" | "REVIEWED" | undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      reviewStatus: status || { in: ["PENDING", "IN_REVIEW"] },
    };
    
    if (voiceAgentId) {
      where.voiceAgentId = voiceAgentId;
    }

    // Fetch calls with pagination
    const [calls, totalCount] = await Promise.all([
      prisma.callSession.findMany({
        where,
        include: {
          voiceAgent: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          dataLabels: true, // Include existing labels
        },
        orderBy: [
          { reviewStatus: "asc" }, // PENDING first, then IN_REVIEW, then REVIEWED
          { startedAt: "desc" },  // Most recent first
        ],
        skip,
        take: limit,
      }),
      prisma.callSession.count({ where }),
    ]);

    // Transform calls to include extracted data quality metrics
    const callsWithMetrics = calls.map((call) => {
      const payloadJson = call.payloadJson as any;
      const responseData = payloadJson?.response_data || [];
      
      // Calculate quality metrics from response_data
      const fields = responseData.map((item: any) => ({
        fieldName: item.key_value,
        fieldLabel: item.key_label,
        value: item.key_response,
        attempts: item.attempts || 1,
        attemptsDetails: item.attempts_details || null,
        remarks: item.remarks || null,
        needsReview: !item.key_response || item.attempts > 1 || item.remarks,
      }));

      const fieldsNeedingReview = fields.filter((f: any) => f.needsReview).length;
      const totalFields = fields.length;
      const dataQualityScore = totalFields > 0 
        ? Math.round(((totalFields - fieldsNeedingReview) / totalFields) * 100)
        : 0;

      return {
        id: call.id,
        callId: call.callId,
        voiceAgent: call.voiceAgent,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        durationSec: call.durationSec,
        outcome: call.outcome,
        sentiment: call.sentiment,
        reviewStatus: call.reviewStatus,
        reviewedAt: call.reviewedAt,
        reviewedBy: call.reviewedBy,
        extractedFields: fields,
        fieldsNeedingReview,
        totalFields,
        dataQualityScore,
        existingLabels: call.dataLabels.length,
      };
    });

    return NextResponse.json({
      success: true,
      calls: callsWithMetrics,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("[Review API] Error fetching calls:", error);
    return NextResponse.json(
      { error: "Failed to fetch calls for review" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/calls/review
 * 
 * Update review status of a call
 * 
 * Body:
 * {
 *   callSessionId: string;
 *   reviewStatus: "PENDING" | "IN_REVIEW" | "REVIEWED" | "NO_ISSUES";
 *   reviewedBy?: string;
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { callSessionId, reviewStatus, reviewedBy } = body;

    if (!callSessionId || !reviewStatus) {
      return NextResponse.json(
        { error: "Missing required fields: callSessionId, reviewStatus" },
        { status: 400 }
      );
    }

    // Update call session
    const updated = await prisma.callSession.update({
      where: { id: callSessionId },
      data: {
        reviewStatus,
        reviewedAt: reviewStatus === "REVIEWED" ? new Date() : null,
        reviewedBy: reviewStatus === "REVIEWED" ? reviewedBy : null,
      },
      include: {
        voiceAgent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      callSession: updated,
    });
  } catch (error) {
    console.error("[Review API] Error updating review status:", error);
    return NextResponse.json(
      { error: "Failed to update review status" },
      { status: 500 }
    );
  }
}
