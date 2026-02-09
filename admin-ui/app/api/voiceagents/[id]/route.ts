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
  // DEBUG: Log whether sample payloads are returned from DB
  console.log(`[GET /api/voiceagents/${params.id}] siSamplePayload: ${voiceAgent.siSamplePayload ? 'EXISTS (' + JSON.stringify(voiceAgent.siSamplePayload).substring(0, 80) + '...)' : 'NULL'}`);
  console.log(`[GET /api/voiceagents/${params.id}] waybeoSamplePayload: ${voiceAgent.waybeoSamplePayload ? 'EXISTS' : 'NULL'}`);
  return NextResponse.json(voiceAgent);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    
    // DEBUG: Log incoming sample payloads
    console.log(`[PATCH /api/voiceagents/${params.id}] body has siSamplePayload: ${'siSamplePayload' in body}, waybeoSamplePayload: ${'waybeoSamplePayload' in body}`);
    if (body.siSamplePayload) {
      console.log(`[PATCH] siSamplePayload value: ${JSON.stringify(body.siSamplePayload).substring(0, 100)}...`);
    }
    
    const data = createVoiceAgentSchema.partial().parse(body);
    
    // DEBUG: Log what Zod parsed
    console.log(`[PATCH] After Zod parse - siSamplePayload: ${'siSamplePayload' in data ? 'PRESENT' : 'MISSING'}, waybeoSamplePayload: ${'waybeoSamplePayload' in data ? 'PRESENT' : 'MISSING'}`);
    
    const voiceAgent = await prisma.voiceAgent.update({
      where: { id: params.id },
      data,
    });
    
    // DEBUG: Log Prisma result
    console.log(`[PATCH] Prisma result - siSamplePayload: ${voiceAgent.siSamplePayload ? 'EXISTS' : 'NULL'}, waybeoSamplePayload: ${voiceAgent.waybeoSamplePayload ? 'EXISTS' : 'NULL'}`);
    
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
    console.error(`[PATCH /api/voiceagents/${params.id}] ERROR:`, err);
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.voiceAgent.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}



