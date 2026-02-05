import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get counts
    const [voiceAgentCount, totalCalls, feedbackCount] = await Promise.all([
      prisma.voiceAgent.count({ where: { isActive: true } }),
      prisma.callSession.count(),
      prisma.feedback.count(),
    ]);

    // Get call stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCalls = await prisma.callSession.findMany({
      where: {
        startedAt: { gte: thirtyDaysAgo },
      },
      select: {
        startedAt: true,
        durationSec: true,
        minutesBilled: true,
        outcome: true,
        sentiment: true,
      },
    });

    // Calculate totals
    const totalMinutes = recentCalls.reduce(
      (acc, call) => acc + Number(call.minutesBilled || 0),
      0
    );
    const avgDuration =
      recentCalls.length > 0
        ? recentCalls.reduce((acc, call) => acc + (call.durationSec || 0), 0) /
          recentCalls.length
        : 0;

    // Outcome distribution
    const outcomeDistribution = {
      complete: recentCalls.filter((c) => c.outcome === "COMPLETE").length,
      partial: recentCalls.filter((c) => c.outcome === "PARTIAL").length,
      incomplete: recentCalls.filter((c) => c.outcome === "INCOMPLETE").length,
      transferred: recentCalls.filter((c) => c.outcome === "TRANSFERRED").length,
    };

    // Sentiment distribution
    const sentimentDistribution = {
      positive: recentCalls.filter((c) => c.sentiment === "POSITIVE").length,
      neutral: recentCalls.filter((c) => c.sentiment === "NEUTRAL").length,
      negative: recentCalls.filter((c) => c.sentiment === "NEGATIVE").length,
    };

    // Calls by date (last 14 days)
    const callsByDate: Record<string, number> = {};
    for (const call of recentCalls) {
      const dateKey = call.startedAt.toISOString().split("T")[0];
      callsByDate[dateKey] = (callsByDate[dateKey] || 0) + 1;
    }

    const chartData = Object.entries(callsByDate)
      .map(([date, calls]) => ({ date, calls }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    // Data capture rate
    const dataCaptureRate =
      recentCalls.length > 0
        ? ((outcomeDistribution.complete + outcomeDistribution.partial) /
            recentCalls.length) *
          100
        : 0;

    return NextResponse.json({
      counts: {
        voiceAgents: voiceAgentCount,
        totalCalls,
        feedback: feedbackCount,
      },
      stats: {
        callsLast30Days: recentCalls.length,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        avgDuration: Math.round(avgDuration),
        dataCaptureRate: Math.round(dataCaptureRate * 10) / 10,
      },
      outcomeDistribution,
      sentimentDistribution,
      chartData,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
