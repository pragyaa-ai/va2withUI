import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createFeedbackSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const voiceAgentId = searchParams.get("voiceAgentId");

  const feedback = await prisma.feedback.findMany({
    where: voiceAgentId ? { voiceAgentId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { voiceAgent: { select: { id: true, name: true } } },
  });
  return NextResponse.json(feedback);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createFeedbackSchema.parse(body);
    const feedback = await prisma.feedback.create({ data });
    return NextResponse.json(feedback, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
