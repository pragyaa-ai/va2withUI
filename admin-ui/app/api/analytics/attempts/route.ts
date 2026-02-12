import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/analytics/attempts
 * 
 * Get aggregate analytics about data capture attempts
 * 
 * Query Parameters:
 * - voiceAgentId: Filter by specific voice agent (optional)
 * - startDate: Start date for analysis (optional, ISO format)
 * - endDate: End date for analysis (optional, ISO format)
 * - fieldName: Filter by specific field (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const voiceAgentId = searchParams.get("voiceAgentId") || undefined;
    const fieldName = searchParams.get("fieldName") || undefined;
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : undefined;
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : undefined;

    // Build where clause
    const where: any = {};
    
    if (voiceAgentId) {
      where.voiceAgentId = voiceAgentId;
    }
    
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }

    // Fetch all call sessions with payload data
    const calls = await prisma.callSession.findMany({
      where,
      select: {
        id: true,
        callId: true,
        voiceAgentId: true,
        startedAt: true,
        outcome: true,
        payloadJson: true,
      },
    });

    // Analyze attempt patterns from response_data in payloadJson
    let totalFields = 0;
    let firstAttemptSuccess = 0;
    let secondAttemptSuccess = 0;
    let thirdPlusAttemptSuccess = 0;
    let notCaptured = 0;

    const fieldStats: Record<string, {
      total: number;
      firstAttempt: number;
      secondAttempt: number;
      thirdPlusAttempt: number;
      notCaptured: number;
    }> = {};

    calls.forEach((call) => {
      const payloadJson = call.payloadJson as any;
      const responseData = payloadJson?.response_data || [];
      
      responseData.forEach((item: any) => {
        const field = item.key_value;
        const hasValue = item.key_response && item.key_response.trim() !== "";
        const attempts = item.attempts || 1;
        
        // Filter by fieldName if specified
        if (fieldName && field !== fieldName) {
          return;
        }
        
        // Initialize field stats
        if (!fieldStats[field]) {
          fieldStats[field] = {
            total: 0,
            firstAttempt: 0,
            secondAttempt: 0,
            thirdPlusAttempt: 0,
            notCaptured: 0,
          };
        }
        
        totalFields++;
        fieldStats[field].total++;
        
        if (!hasValue) {
          notCaptured++;
          fieldStats[field].notCaptured++;
        } else if (attempts === 1) {
          firstAttemptSuccess++;
          fieldStats[field].firstAttempt++;
        } else if (attempts === 2) {
          secondAttemptSuccess++;
          fieldStats[field].secondAttempt++;
        } else {
          thirdPlusAttemptSuccess++;
          fieldStats[field].thirdPlusAttempt++;
        }
      });
    });

    // Calculate percentages
    const calculatePercentage = (value: number, total: number) => {
      return total > 0 ? Math.round((value / total) * 100) : 0;
    };

    const overallStats = {
      totalFields,
      totalCalls: calls.length,
      firstAttemptSuccess,
      firstAttemptRate: calculatePercentage(firstAttemptSuccess, totalFields),
      secondAttemptSuccess,
      secondAttemptRate: calculatePercentage(secondAttemptSuccess, totalFields),
      thirdPlusAttemptSuccess,
      thirdPlusAttemptRate: calculatePercentage(thirdPlusAttemptSuccess, totalFields),
      notCaptured,
      notCapturedRate: calculatePercentage(notCaptured, totalFields),
      overallCaptureRate: calculatePercentage(
        firstAttemptSuccess + secondAttemptSuccess + thirdPlusAttemptSuccess,
        totalFields
      ),
    };

    // Transform field stats with percentages
    const fieldStatsWithPercentages = Object.entries(fieldStats).map(
      ([field, stats]) => ({
        fieldName: field,
        total: stats.total,
        firstAttempt: stats.firstAttempt,
        firstAttemptRate: calculatePercentage(stats.firstAttempt, stats.total),
        secondAttempt: stats.secondAttempt,
        secondAttemptRate: calculatePercentage(stats.secondAttempt, stats.total),
        thirdPlusAttempt: stats.thirdPlusAttempt,
        thirdPlusAttemptRate: calculatePercentage(stats.thirdPlusAttempt, stats.total),
        notCaptured: stats.notCaptured,
        notCapturedRate: calculatePercentage(stats.notCaptured, stats.total),
        captureRate: calculatePercentage(
          stats.firstAttempt + stats.secondAttempt + stats.thirdPlusAttempt,
          stats.total
        ),
      })
    );

    // Sort by total count descending
    fieldStatsWithPercentages.sort((a, b) => b.total - a.total);

    console.log(`[Attempts Analytics] Analyzed ${calls.length} calls, ${totalFields} fields`);

    return NextResponse.json({
      success: true,
      overallStats,
      fieldStats: fieldStatsWithPercentages,
      filters: {
        voiceAgentId,
        fieldName,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error("[Attempts Analytics] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attempt analytics" },
      { status: 500 }
    );
  }
}
