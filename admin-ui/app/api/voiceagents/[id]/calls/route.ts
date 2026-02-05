import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ExtractedData {
  full_name?: string;
  car_model?: string;
  email_id?: string;
  test_drive_interest?: string;
}

// SI Webhook Payload format
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
}

// Helper to extract value from response_data array
function getResponseValue(responseData: ResponseDataItem[] | undefined, keyValue: string): string | null {
  if (!responseData) return null;
  const item = responseData.find((r) => r.key_value === keyValue);
  return item?.key_response?.trim() || null;
}

/**
 * GET /api/voiceagents/[id]/calls
 * List calls for a VoiceAgent with filtering, pagination, and date range
 * 
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - outcome: COMPLETE | PARTIAL | INCOMPLETE | TRANSFERRED
 * - sentiment: POSITIVE | NEUTRAL | NEGATIVE
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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const outcome = searchParams.get("outcome");
    const sentiment = searchParams.get("sentiment");
    const filterStoreCode = searchParams.get("storeCode");
    const filterCarModel = searchParams.get("carModel");
    const filterTestDrive = searchParams.get("testDrive");

    // Build where clause for basic filters
    const where: Record<string, unknown> = {
      voiceAgentId: params.id,
    };

    // Date range filter
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        (where.startedAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        (where.startedAt as Record<string, Date>).lte = end;
      }
    }

    // Outcome filter
    if (outcome) {
      where.outcome = outcome;
    }

    // Sentiment filter
    if (sentiment) {
      where.sentiment = sentiment;
    }

    // For JSON field filters, we need to fetch more and filter in memory
    const needsJsonFilter = filterStoreCode || filterCarModel || filterTestDrive;

    // Fetch calls - if JSON filtering needed, get more to account for filtering
    const fetchLimit = needsJsonFilter ? limit * 5 : limit;
    const skip = needsJsonFilter ? 0 : (page - 1) * limit;

    let calls = await prisma.callSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: needsJsonFilter ? undefined : fetchLimit,
      select: {
        id: true,
        callId: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        startedAt: true,
        endedAt: true,
        durationSec: true,
        minutesBilled: true,
        outcome: true,
        sentiment: true,
        sentimentScore: true,
        summary: true,
        extractedData: true,
        payloadJson: true,
      },
    });

    // Apply JSON field filters
    if (needsJsonFilter) {
      calls = calls.filter((call) => {
        const extracted = call.extractedData as unknown as ExtractedData | null;
        const payload = call.payloadJson as unknown as SIPayloadData | null;
        
        // Store code filter (SI payload format: store_code at root)
        if (filterStoreCode) {
          const storeCode = payload?.store_code?.toString() || payload?.store?.toString();
          if (storeCode !== filterStoreCode) return false;
        }
        
        // Car model filter (check SI payload response_data first, then extractedData)
        if (filterCarModel) {
          const carModelFromPayload = getResponseValue(payload?.response_data, "model");
          const carModel = carModelFromPayload || extracted?.car_model;
          if (carModel !== filterCarModel) return false;
        }
        
        // Test drive filter (check SI payload response_data first, then extractedData)
        if (filterTestDrive) {
          const testDriveFromPayload = getResponseValue(payload?.response_data, "test_drive");
          const testDrive = (testDriveFromPayload || extracted?.test_drive_interest || "").toLowerCase();
          const isYes = ["yes", "sure", "definitely", "maybe", "later", "हाँ", "शायद", "ठीक है"].some(
            (v) => testDrive.includes(v)
          );
          const isNo = ["no", "not", "नहीं", "अभी नहीं"].some(
            (v) => testDrive.includes(v)
          );
          
          if (filterTestDrive === "yes" && !isYes) return false;
          if (filterTestDrive === "no" && !isNo) return false;
        }
        
        return true;
      });
    }

    // Calculate total and paginate
    const total = calls.length;
    const paginatedCalls = needsJsonFilter 
      ? calls.slice((page - 1) * limit, page * limit)
      : calls;

    // Get actual total count for pagination
    const actualTotal = needsJsonFilter 
      ? total 
      : await prisma.callSession.count({ where });

    return NextResponse.json({
      calls: paginatedCalls.map((call) => ({
        ...call,
        payloadJson: undefined, // Don't send full payload in list
      })),
      pagination: {
        page,
        limit,
        total: actualTotal,
        totalPages: Math.ceil(actualTotal / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching calls:", error);
    return NextResponse.json(
      { error: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}
