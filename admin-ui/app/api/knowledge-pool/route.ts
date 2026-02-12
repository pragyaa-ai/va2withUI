import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/knowledge-pool
 * 
 * Fetch all human-labeled corrections for improving VoiceAgent accuracy.
 * This endpoint is called by the telephony service to get the knowledge pool
 * for contextual understanding of difficult-to-capture terms.
 * 
 * Query Parameters:
 * - voiceAgentSlug: Filter by specific voice agent (optional)
 * - fieldName: Filter by specific field (name, model, email, test_drive) (optional)
 * - limit: Max results to return (default: 100)
 * - onlyCorrections: Return only incorrect extractions (default: true)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const voiceAgentSlug = searchParams.get("voiceAgentSlug") || undefined;
    const fieldName = searchParams.get("fieldName") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100");
    const onlyCorrections = searchParams.get("onlyCorrections") !== "false"; // default true

    // Build where clause
    const where: any = {};
    
    if (onlyCorrections) {
      where.isCorrect = false; // Only fetch corrections, not confirmations
    }
    
    if (fieldName) {
      where.fieldName = fieldName;
    }
    
    if (voiceAgentSlug) {
      where.voiceAgent = {
        slug: voiceAgentSlug,
      };
    }

    // Fetch labels
    const labels = await prisma.dataLabel.findMany({
      where,
      include: {
        voiceAgent: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
        callSession: {
          select: {
            id: true,
            callId: true,
            startedAt: true,
          },
        },
      },
      orderBy: { labeledAt: "desc" },
      take: limit,
    });

    // Transform into a knowledge pool format optimized for telephony service
    const knowledgePool = labels.map((label) => ({
      id: label.id,
      voiceAgent: label.voiceAgent?.slug,
      fieldName: label.fieldName,
      fieldLabel: label.fieldLabel,
      
      // What was wrong
      originalValue: label.originalValue,
      correctedValue: label.correctedValue,
      
      // Why it was wrong
      correctionReason: label.correctionReason,
      
      // Context to help AI learn
      audioSnippet: label.audioSnippet,
      userUtterance: label.userUtterance,
      
      // When this knowledge was created
      labeledAt: label.labeledAt,
      callId: label.callSession.callId,
    }));

    // Group by field for easier lookup
    const groupedByField: Record<string, any[]> = {};
    knowledgePool.forEach((item) => {
      if (!groupedByField[item.fieldName]) {
        groupedByField[item.fieldName] = [];
      }
      groupedByField[item.fieldName].push(item);
    });

    console.log(`[Knowledge Pool] Fetched ${labels.length} labels for ${voiceAgentSlug || 'all agents'}`);

    return NextResponse.json({
      success: true,
      knowledgePool,
      groupedByField,
      totalCount: labels.length,
      metadata: {
        voiceAgentSlug,
        fieldName,
        onlyCorrections,
      },
    });
  } catch (error) {
    console.error("[Knowledge Pool API] Error fetching knowledge pool:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge pool" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/knowledge-pool/stats
 * 
 * Get statistics about the knowledge pool
 * 
 * Returns:
 * - Total corrections by field
 * - Most common correction reasons
 * - Accuracy improvement trends
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { voiceAgentSlug } = body || {};

    // Build where clause
    const where: any = {
      isCorrect: false, // Only corrections
    };
    
    if (voiceAgentSlug) {
      where.voiceAgent = {
        slug: voiceAgentSlug,
      };
    }

    // Get statistics
    const [
      totalCorrections,
      correctionsByField,
      correctionsByReason,
      recentCorrections,
    ] = await Promise.all([
      // Total corrections count
      prisma.dataLabel.count({ where }),
      
      // Group by field
      prisma.dataLabel.groupBy({
        by: ["fieldName"],
        where,
        _count: { id: true },
      }),
      
      // Group by correction reason
      prisma.dataLabel.groupBy({
        by: ["correctionReason"],
        where: {
          ...where,
          correctionReason: { not: null },
        },
        _count: { id: true },
      }),
      
      // Recent corrections (last 7 days)
      prisma.dataLabel.count({
        where: {
          ...where,
          labeledAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalCorrections,
        recentCorrections,
        correctionsByField: correctionsByField.map((item) => ({
          fieldName: item.fieldName,
          count: item._count.id,
        })),
        correctionsByReason: correctionsByReason.map((item) => ({
          reason: item.correctionReason,
          count: item._count.id,
        })),
      },
    });
  } catch (error) {
    console.error("[Knowledge Pool API] Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge pool stats" },
      { status: 500 }
    );
  }
}
