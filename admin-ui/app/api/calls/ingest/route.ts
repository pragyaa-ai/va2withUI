import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * POST /api/calls/ingest
 * 
 * Receives and stores the SI webhook payload format.
 * This endpoint should be called by the webhook service after generating
 * the payload, so the data is available in the admin UI for analytics.
 * 
 * Expected payload format (SI Webhook format):
 * {
 *   "id": "bot_...",
 *   "call_ref_id": "...",
 *   "customer_name": "Kia",
 *   "store_code": "UK401",
 *   "customer_number": 919556091099,
 *   "start_time": "2026-01-31 13:36:41",
 *   "end_time": "2026-01-31 13:38:00",
 *   "duration": 79,
 *   "completion_status": "partial",
 *   "response_data": [
 *     { "key_value": "name", "key_response": "Suman", ... },
 *     { "key_value": "model", "key_response": "EV9", ... },
 *     { "key_value": "test_drive", "key_response": "No", ... }
 *   ],
 *   "transcript": [
 *     { "timestamp": "...", "speaker": "user", "text": "..." },
 *     { "timestamp": "...", "speaker": "agent", "text": "..." }
 *   ],
 *   ...
 * }
 */

interface ResponseDataItem {
  key_value: string;
  key_response: string;
  key_label?: string;
  remarks?: string;
  attempts?: number;
}

interface TranscriptEntry {
  timestamp: string;
  speaker: string;
  text: string;
}

interface SIPayload {
  id?: string;
  call_ref_id: string;
  agent_slug?: string;
  customer_name?: string;
  call_vendor?: string;
  store_code?: string;
  customer_number?: number | string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  completion_status?: string;
  response_data?: ResponseDataItem[];
  transcript?: TranscriptEntry[];
  language?: {
    welcome?: string;
    conversational?: string;
  };
  dealer_routing?: {
    status?: boolean;
    reason?: string;
    time?: string;
  };
  dropoff?: {
    time?: string;
    action?: string;
  };
}

// Helper to extract value from response_data array
function getResponseValue(responseData: ResponseDataItem[] | undefined, keyValue: string): string | null {
  if (!responseData) return null;
  const item = responseData.find((r) => r.key_value === keyValue);
  return item?.key_response?.trim() || null;
}

// Map completion_status to CallOutcome enum
function mapCompletionStatus(status?: string): "COMPLETE" | "PARTIAL" | "INCOMPLETE" | "TRANSFERRED" | null {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (normalized === "complete" || normalized === "completed") return "COMPLETE";
  if (normalized === "partial") return "PARTIAL";
  if (normalized === "incomplete") return "INCOMPLETE";
  if (normalized === "transferred" || normalized === "transfer") return "TRANSFERRED";
  return null;
}

// Generate summary and sentiment from transcript using Gemini
async function generateSummaryAndSentiment(transcript: TranscriptEntry[]): Promise<{
  summary: string | null;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null;
  sentimentScore: number | null;
}> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || transcript.length === 0) {
    return { summary: null, sentiment: null, sentimentScore: null };
  }

  try {
    // Format transcript for analysis
    const conversationText = transcript
      .map((entry) => `${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze the following customer service call transcript and provide:
1. Overall sentiment (POSITIVE, NEUTRAL, or NEGATIVE)
2. Sentiment score from 0.0 to 1.0 (0.0 = very negative, 0.5 = neutral, 1.0 = very positive)
3. A brief 2-3 sentence summary of the call

TRANSCRIPT:
${conversationText}

Respond in JSON format only:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "sentimentScore": 0.75,
  "summary": "Brief summary here"
}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("[Ingest] Gemini API error:", response.status);
      return { summary: null, sentiment: null, sentimentScore: null };
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { summary: null, sentiment: null, sentimentScore: null };
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return {
      summary: analysis.summary || null,
      sentiment: analysis.sentiment || null,
      sentimentScore: analysis.sentimentScore ? parseFloat(analysis.sentimentScore) : null,
    };
  } catch (error) {
    console.error("[Ingest] Error generating summary/sentiment:", error);
    return { summary: null, sentiment: null, sentimentScore: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload: SIPayload = await request.json();

    if (!payload.call_ref_id) {
      return NextResponse.json(
        { error: "Missing required field: call_ref_id" },
        { status: 400 }
      );
    }

    // Find voiceAgent by agent_slug first (most reliable), then fallback to customer_name
    let voiceAgentId: string | null = null;
    if (payload.agent_slug) {
      const voiceAgent = await prisma.voiceAgent.findUnique({
        where: { slug: payload.agent_slug.toLowerCase() },
        select: { id: true },
      });
      voiceAgentId = voiceAgent?.id || null;
    }
    if (!voiceAgentId && payload.customer_name) {
      const voiceAgent = await prisma.voiceAgent.findFirst({
        where: {
          OR: [
            { slug: payload.customer_name.toLowerCase() },
            { name: { contains: payload.customer_name, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      voiceAgentId = voiceAgent?.id || null;
    }

    // Parse dates
    const startedAt = payload.start_time ? new Date(payload.start_time) : new Date();
    const endedAt = payload.end_time ? new Date(payload.end_time) : null;

    // Extract data from response_data for convenience
    const extractedData = {
      full_name: getResponseValue(payload.response_data, "name"),
      car_model: getResponseValue(payload.response_data, "model"),
      email_id: getResponseValue(payload.response_data, "email"),
      test_drive_interest: getResponseValue(payload.response_data, "test_drive"),
    };

    // Auto-generate summary and sentiment if transcript is provided
    let summary: string | null = null;
    let sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null = null;
    let sentimentScore: number | null = null;

    if (payload.transcript && payload.transcript.length > 0) {
      console.log(`[Ingest] Generating summary/sentiment for ${payload.call_ref_id}...`);
      const analysis = await generateSummaryAndSentiment(payload.transcript);
      summary = analysis.summary;
      sentiment = analysis.sentiment;
      sentimentScore = analysis.sentimentScore;
      console.log(`[Ingest] Generated: sentiment=${sentiment}, score=${sentimentScore}`);
    }

    // Upsert the call session (update if exists, create if not)
    const callSession = await prisma.callSession.upsert({
      where: {
        callId: payload.call_ref_id,
      },
      update: {
        voiceAgentId,
        fromNumber: payload.customer_number?.toString() || null,
        startedAt,
        endedAt,
        durationSec: payload.duration || null,
        minutesBilled: payload.duration ? new Prisma.Decimal(Math.ceil(payload.duration / 60)) : null,
        outcome: mapCompletionStatus(payload.completion_status),
        extractedData: extractedData as Prisma.InputJsonValue,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        transcript: payload.transcript as unknown as Prisma.InputJsonValue ?? undefined,
        summary: summary ?? undefined,
        sentiment: sentiment ?? undefined,
        sentimentScore: sentimentScore ?? undefined,
      },
      create: {
        callId: payload.call_ref_id,
        voiceAgentId,
        direction: "inbound",
        fromNumber: payload.customer_number?.toString() || null,
        startedAt,
        endedAt,
        durationSec: payload.duration || null,
        minutesBilled: payload.duration ? new Prisma.Decimal(Math.ceil(payload.duration / 60)) : null,
        outcome: mapCompletionStatus(payload.completion_status),
        extractedData: extractedData as Prisma.InputJsonValue,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        transcript: payload.transcript as unknown as Prisma.InputJsonValue ?? undefined,
        summary: summary ?? undefined,
        sentiment: sentiment ?? undefined,
        sentimentScore: sentimentScore ?? undefined,
      },
    });

    console.log(`[Ingest] Call ${payload.call_ref_id} stored for ${payload.customer_name || "unknown"}`);

    return NextResponse.json({
      success: true,
      callSessionId: callSession.id,
      voiceAgentId,
      storeCode: payload.store_code,
      carModel: extractedData.car_model,
      testDrive: extractedData.test_drive_interest,
      summary,
      sentiment,
    });
  } catch (error) {
    console.error("[Ingest] Error storing call:", error);
    return NextResponse.json(
      { error: "Failed to store call data" },
      { status: 500 }
    );
  }
}
