import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVoiceAgentSchema } from "@/lib/validation";
import { validatePayloadTemplate } from "@/lib/payloadTemplateValidation";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const voiceAgent = await prisma.voiceAgent.findUnique({
    where: { id: params.id },
    include: {
      callFlow: { include: { steps: { orderBy: { order: "asc" } } } },
      guardrails: { orderBy: { createdAt: "desc" } },
      voiceProfile: true,
      _count: { select: { sessions: true, feedback: true } },
    },
  });
  if (!voiceAgent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(voiceAgent);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data = createVoiceAgentSchema.partial().parse(body);
    const voiceAgent = await prisma.voiceAgent.update({
      where: { id: params.id },
      data,
    });
    const siValidation = validatePayloadTemplate(data.siPayloadTemplate);
    const waybeoValidation = validatePayloadTemplate(data.waybeoPayloadTemplate);
    return NextResponse.json({
      voiceAgent,
      templateValidation: {
        si: siValidation,
        waybeo: waybeoValidation,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.voiceAgent.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}



