import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVoiceAgentSchema } from "@/lib/validation";

export async function GET() {
  const voiceAgents = await prisma.voiceAgent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sessions: true, feedback: true, guardrails: true } },
    },
  });
  return NextResponse.json(voiceAgents);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createVoiceAgentSchema.parse(body);
    const voiceAgent = await prisma.voiceAgent.create({ data });
    return NextResponse.json(voiceAgent, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



