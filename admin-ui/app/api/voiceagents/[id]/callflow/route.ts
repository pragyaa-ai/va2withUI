import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCallFlowSchema } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const callFlow = await prisma.callFlow.findUnique({
    where: { voiceAgentId: params.id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(callFlow ?? { greeting: "", steps: [] });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data = updateCallFlowSchema.parse(body);

    const existing = await prisma.callFlow.findUnique({ where: { voiceAgentId: params.id } });

    if (existing) {
      // Delete old steps and recreate
      await prisma.callFlowStep.deleteMany({ where: { callFlowId: existing.id } });
      const updated = await prisma.callFlow.update({
        where: { id: existing.id },
        data: {
          greeting: data.greeting,
          steps: data.steps
            ? { create: data.steps.map((s, i) => ({ order: s.order ?? i, title: s.title, content: s.content, enabled: s.enabled })) }
            : undefined,
        },
        include: { steps: { orderBy: { order: "asc" } } },
      });
      return NextResponse.json(updated);
    } else {
      const created = await prisma.callFlow.create({
        data: {
          voiceAgentId: params.id,
          greeting: data.greeting,
          steps: data.steps
            ? { create: data.steps.map((s, i) => ({ order: s.order ?? i, title: s.title, content: s.content, enabled: s.enabled })) }
            : undefined,
        },
        include: { steps: { orderBy: { order: "asc" } } },
      });
      return NextResponse.json(created, { status: 201 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



