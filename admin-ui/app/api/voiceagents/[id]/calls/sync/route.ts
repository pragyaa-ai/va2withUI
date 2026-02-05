import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

interface QueueProcessorResult {
  call_id: string;
  processed_at: string;
  success: boolean;
  extracted_data?: {
    full_name?: string;
    car_model?: string;
    email_id?: string;
    test_drive_interest?: string;
    confidence_scores?: Record<string, number>;
    data_points?: Record<string, unknown>;
    overall_status?: string;
  };
  call_analytics?: {
    call_length?: number;
    call_start_time?: number;
    call_end_time?: number;
    total_exchanges?: number;
    user_messages?: number;
    assistant_messages?: number;
    question_answer_pairs?: unknown[];
  };
  processing?: {
    transcript_file?: string;
  };
}

interface TranscriptData {
  call_id: string;
  timestamp: string;
  call_start_time?: number;
  call_end_time?: number;
  call_duration?: number;
  conversation?: Array<{
    timestamp: string;
    speaker: string;
    text: string;
    event_type?: string;
  }>;
  simple_transcripts?: string[];
  current_sales_data?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
}

/**
 * POST /api/voiceagents/[id]/calls/sync
 * Sync calls from queue processor results directory
 * 
 * Body:
 * - resultsDir: path to results directory (default: /opt/voiceagent/data/results)
 * - transcriptsDir: path to transcripts directory (default: /opt/voiceagent/data/transcripts)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const resultsDir = body.resultsDir || process.env.QUEUE_PROCESSOR_RESULTS_DIR || "/opt/voiceagent/data/results";
    const transcriptsDir = body.transcriptsDir || process.env.QUEUE_PROCESSOR_TRANSCRIPTS_DIR || "/opt/voiceagent/data/transcripts";

    // Verify VoiceAgent exists
    const voiceAgent = await prisma.voiceAgent.findUnique({
      where: { id: params.id },
    });

    if (!voiceAgent) {
      return NextResponse.json(
        { error: "VoiceAgent not found" },
        { status: 404 }
      );
    }

    // Check if results directory exists
    if (!fs.existsSync(resultsDir)) {
      return NextResponse.json(
        { error: `Results directory not found: ${resultsDir}` },
        { status: 400 }
      );
    }

    // Read all result files
    const resultFiles = fs.readdirSync(resultsDir)
      .filter((file) => file.endsWith("_result.json"))
      .sort();

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const resultFile of resultFiles) {
      try {
        const resultPath = path.join(resultsDir, resultFile);
        const resultData: QueueProcessorResult = JSON.parse(
          fs.readFileSync(resultPath, "utf-8")
        );

        // Check if already synced
        const existing = await prisma.callSession.findFirst({
          where: { callId: resultData.call_id },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Try to load transcript
        let transcriptData: TranscriptData | null = null;
        if (resultData.processing?.transcript_file) {
          const transcriptPath = path.join(
            transcriptsDir,
            resultData.processing.transcript_file
          );
          if (fs.existsSync(transcriptPath)) {
            transcriptData = JSON.parse(
              fs.readFileSync(transcriptPath, "utf-8")
            );
          }
        }

        // Determine outcome
        let outcome: "COMPLETE" | "PARTIAL" | "INCOMPLETE" | "TRANSFERRED" = "INCOMPLETE";
        const overallStatus = resultData.extracted_data?.overall_status;
        if (overallStatus === "complete") outcome = "COMPLETE";
        else if (overallStatus === "partial") outcome = "PARTIAL";

        // Calculate duration and minutes
        const durationMs = resultData.call_analytics?.call_length ||
          (transcriptData?.call_duration) || 0;
        const durationSec = Math.round(durationMs / 1000);
        const minutesBilled = durationSec / 60;

        // Create call session
        await prisma.callSession.create({
          data: {
            callId: resultData.call_id,
            voiceAgentId: params.id,
            direction: "inbound",
            startedAt: resultData.call_analytics?.call_start_time
              ? new Date(resultData.call_analytics.call_start_time)
              : new Date(resultData.processed_at),
            endedAt: resultData.call_analytics?.call_end_time
              ? new Date(resultData.call_analytics.call_end_time)
              : undefined,
            durationSec,
            minutesBilled,
            outcome,
            transcript: transcriptData?.conversation 
              ? JSON.parse(JSON.stringify(transcriptData.conversation)) as Prisma.InputJsonValue
              : undefined,
            extractedData: resultData.extracted_data 
              ? JSON.parse(JSON.stringify(resultData.extracted_data)) as Prisma.InputJsonValue
              : undefined,
            analyticsJson: resultData.call_analytics 
              ? JSON.parse(JSON.stringify(resultData.call_analytics)) as Prisma.InputJsonValue
              : undefined,
            payloadJson: JSON.parse(JSON.stringify(resultData)) as Prisma.InputJsonValue,
          },
        });

        synced++;
      } catch (fileError) {
        console.error(`Error processing ${resultFile}:`, fileError);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      errors,
      total: resultFiles.length,
    });
  } catch (error) {
    console.error("Error syncing calls:", error);
    return NextResponse.json(
      { error: "Failed to sync calls" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/voiceagents/[id]/calls/sync
 * Get sync status (check if results directory is accessible)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resultsDir = process.env.QUEUE_PROCESSOR_RESULTS_DIR || "/opt/voiceagent/data/results";
    const transcriptsDir = process.env.QUEUE_PROCESSOR_TRANSCRIPTS_DIR || "/opt/voiceagent/data/transcripts";

    const resultsExists = fs.existsSync(resultsDir);
    const transcriptsExists = fs.existsSync(transcriptsDir);

    let resultCount = 0;
    if (resultsExists) {
      resultCount = fs.readdirSync(resultsDir)
        .filter((file) => file.endsWith("_result.json")).length;
    }

    // Count existing synced calls
    const syncedCount = await prisma.callSession.count({
      where: {
        voiceAgentId: params.id,
        callId: { not: null },
      },
    });

    return NextResponse.json({
      resultsDir,
      transcriptsDir,
      resultsExists,
      transcriptsExists,
      availableResults: resultCount,
      syncedCalls: syncedCount,
      pendingSync: Math.max(0, resultCount - syncedCount),
    });
  } catch (error) {
    console.error("Error checking sync status:", error);
    return NextResponse.json(
      { error: "Failed to check sync status" },
      { status: 500 }
    );
  }
}
