import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ConversationEntry {
  timestamp: string;
  speaker: string;
  text: string;
}

/**
 * POST /api/voiceagents/[id]/calls/[callId]/sentiment
 * Generate sentiment analysis on-demand using Gemini API
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    // Find the call
    const call = await prisma.callSession.findFirst({
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

    // Check if transcript exists
    if (!call.transcript) {
      return NextResponse.json(
        { error: "No transcript available for sentiment analysis" },
        { status: 400 }
      );
    }

    // Format transcript for analysis
    const transcript = call.transcript as unknown as ConversationEntry[];
    const conversationText = transcript
      .map((entry) => `${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join("\n");

    // Call Gemini API for sentiment analysis
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    const geminiResponse = await fetch(
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

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", await geminiResponse.text());
      return NextResponse.json(
        { error: "Failed to analyze sentiment" },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse sentiment response" },
        { status: 500 }
      );
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Update call with sentiment data
    const updated = await prisma.callSession.update({
      where: { id: call.id },
      data: {
        sentiment: analysis.sentiment,
        sentimentScore: parseFloat(analysis.sentimentScore),
        summary: analysis.summary,
      },
    });

    return NextResponse.json({
      sentiment: updated.sentiment,
      sentimentScore: updated.sentimentScore,
      summary: updated.summary,
    });
  } catch (error) {
    console.error("Error generating sentiment:", error);
    return NextResponse.json(
      { error: "Failed to generate sentiment analysis" },
      { status: 500 }
    );
  }
}
