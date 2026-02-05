import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGuardrailSchema } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guardrails = await prisma.guardrail.findMany({
    where: { voiceAgentId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(guardrails);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data = createGuardrailSchema.parse(body);
    const guardrail = await prisma.guardrail.create({
      data: { ...data, voiceAgentId: params.id },
    });
    return NextResponse.json(guardrail, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



