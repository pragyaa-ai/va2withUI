import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ExtractedData {
  car_model?: string;
  test_drive_interest?: string;
}

// SI Webhook Payload format (the actual payload structure)
interface ResponseDataItem {
  key_value: string;
  key_response: string;
  key_label?: string;
  remarks?: string;
  attempts?: number;
}

interface SIPayloadData {
  store?: string | number;
  store_code?: string | number;
  response_data?: ResponseDataItem[];
  completion_status?: string;
  customer_number?: number | string;
  duration?: number;
}

// Helper to extract value from response_data array
function getResponseValue(responseData: ResponseDataItem[] | undefined, keyValue: string): string | null {
  if (!responseData) return null;
  const item = responseData.find((r) => r.key_value === keyValue);
  return item?.key_response?.trim() || null;
}

/**
 * GET /api/voiceagents/[id]/analytics
 * Get aggregated analytics for charts
 * 
 * Query params:
 * - period: "today" | "7d" | "30d" | "90d" | "all" (default: "30d")
 * - startDate: ISO date string for custom range
 * - endDate: ISO date string for custom range
 * - storeCode: Filter by store code
 * - carModel: Filter by car model
 * - testDrive: Filter by test drive interest (yes/no)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");
    const filterStoreCode = searchParams.get("storeCode");
    const filterCarModel = searchParams.get("carModel");
    const filterTestDrive = searchParams.get("testDrive");

    // Calculate date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    const now = new Date();

    // Handle custom date range
    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "all":
          startDate = undefined;
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    }

    const where: Record<string, unknown> = {
      voiceAgentId: params.id,
    };

    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        (where.startedAt as Record<string, Date>).gte = startDate;
      }
      if (endDate) {
        (where.startedAt as Record<string, Date>).lte = endDate;
      }
    }

    // Get all calls in period with extended data
    const calls = await prisma.callSession.findMany({
      where,
      select: {
        id: true,
        startedAt: true,
        durationSec: true,
        minutesBilled: true,
        outcome: true,
        sentiment: true,
        extractedData: true,
        payloadJson: true,
      },
      orderBy: { startedAt: "asc" },
    });

    // Extract store codes, car models, test drive from calls
    const processedCalls = calls.map((call) => {
      const extracted = call.extractedData as unknown as ExtractedData | null;
      const payload = call.payloadJson as unknown as SIPayloadData | null;
      
      // Store code can be in "store" or "store_code" field (SI payload format)
      const storeCode = payload?.store_code?.toString() || payload?.store?.toString() || null;
      
      // Car model: first try SI payload response_data, then extractedData
      const carModelFromPayload = getResponseValue(payload?.response_data, "model");
      const carModel = carModelFromPayload || extracted?.car_model || null;
      
      // Test drive: first try SI payload response_data, then extractedData
      const testDriveFromPayload = getResponseValue(payload?.response_data, "test_drive");
      const testDrive = (testDriveFromPayload || extracted?.test_drive_interest || "").toLowerCase() || null;
      
      return {
        ...call,
        storeCode,
        carModel,
        testDrive,
      };
    });

    // Apply filters
    let filteredCalls = processedCalls;
    
    if (filterStoreCode) {
      filteredCalls = filteredCalls.filter((c) => c.storeCode === filterStoreCode);
    }
    if (filterCarModel) {
      filteredCalls = filteredCalls.filter((c) => c.carModel === filterCarModel);
    }
    if (filterTestDrive) {
      filteredCalls = filteredCalls.filter((c) => {
        if (filterTestDrive === "yes") {
          return c.testDrive && ["yes", "sure", "definitely", "maybe", "later", "हाँ", "शायद", "ठीक है"].some(
            (v) => c.testDrive?.includes(v)
          );
        }
        if (filterTestDrive === "no") {
          return c.testDrive && ["no", "not", "नहीं", "अभी नहीं"].some(
            (v) => c.testDrive?.includes(v)
          );
        }
        return true;
      });
    }

    // Calculate distributions from ALL calls (before filters) for filter dropdowns
    const storeCodeDistribution: Record<string, number> = {};
    const carModelDistribution: Record<string, number> = {};
    const testDriveDistribution = { yes: 0, no: 0, unknown: 0 };

    for (const call of processedCalls) {
      // Store code
      if (call.storeCode) {
        storeCodeDistribution[call.storeCode] = (storeCodeDistribution[call.storeCode] || 0) + 1;
      }
      
      // Car model
      if (call.carModel) {
        carModelDistribution[call.carModel] = (carModelDistribution[call.carModel] || 0) + 1;
      }
      
      // Test drive
      if (call.testDrive) {
        const isYes = ["yes", "sure", "definitely", "maybe", "later", "हाँ", "शायद", "ठीक है"].some(
          (v) => call.testDrive?.includes(v)
        );
        const isNo = ["no", "not", "नहीं", "अभी नहीं"].some(
          (v) => call.testDrive?.includes(v)
        );
        if (isYes) testDriveDistribution.yes++;
        else if (isNo) testDriveDistribution.no++;
        else testDriveDistribution.unknown++;
      } else {
        testDriveDistribution.unknown++;
      }
    }

    // Aggregate by date (using filtered calls)
    const callsByDate: Record<string, { calls: number; minutes: number }> = {};
    
    for (const call of filteredCalls) {
      const dateKey = call.startedAt.toISOString().split("T")[0];
      if (!callsByDate[dateKey]) {
        callsByDate[dateKey] = { calls: 0, minutes: 0 };
      }
      callsByDate[dateKey].calls += 1;
      callsByDate[dateKey].minutes += Number(call.minutesBilled || 0);
    }

    // Convert to array for charts
    const chartData = Object.entries(callsByDate)
      .map(([date, data]) => ({
        date,
        calls: data.calls,
        minutes: Math.round(data.minutes * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate outcome distribution (filtered)
    const outcomeDistribution = {
      complete: filteredCalls.filter((c) => c.outcome === "COMPLETE").length,
      partial: filteredCalls.filter((c) => c.outcome === "PARTIAL").length,
      incomplete: filteredCalls.filter((c) => c.outcome === "INCOMPLETE").length,
      transferred: filteredCalls.filter((c) => c.outcome === "TRANSFERRED").length,
    };

    // Calculate sentiment distribution (filtered)
    const sentimentDistribution = {
      positive: filteredCalls.filter((c) => c.sentiment === "POSITIVE").length,
      neutral: filteredCalls.filter((c) => c.sentiment === "NEUTRAL").length,
      negative: filteredCalls.filter((c) => c.sentiment === "NEGATIVE").length,
      unknown: filteredCalls.filter((c) => !c.sentiment).length,
    };

    // Calculate summary stats (filtered)
    const totalCalls = filteredCalls.length;
    const totalMinutes = filteredCalls.reduce((acc, c) => acc + Number(c.minutesBilled || 0), 0);
    const avgDuration = totalCalls > 0
      ? filteredCalls.reduce((acc, c) => acc + (c.durationSec || 0), 0) / totalCalls
      : 0;
    const dataCaptureRate = totalCalls > 0
      ? ((outcomeDistribution.complete + outcomeDistribution.partial) / totalCalls) * 100
      : 0;

    // Calculate trend (compare to previous period)
    let previousPeriodCalls = 0;
    if (startDate) {
      const previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
      previousPeriodCalls = await prisma.callSession.count({
        where: {
          voiceAgentId: params.id,
          startedAt: {
            gte: previousStartDate,
            lt: startDate,
          },
        },
      });
    }

    const callsTrend = previousPeriodCalls > 0
      ? ((totalCalls - previousPeriodCalls) / previousPeriodCalls) * 100
      : 0;

    return NextResponse.json({
      summary: {
        totalCalls,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        avgDuration: Math.round(avgDuration),
        dataCaptureRate: Math.round(dataCaptureRate * 10) / 10,
        callsTrend: Math.round(callsTrend * 10) / 10,
      },
      chartData,
      outcomeDistribution,
      sentimentDistribution,
      storeCodeDistribution,
      carModelDistribution,
      testDriveDistribution,
      period,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
