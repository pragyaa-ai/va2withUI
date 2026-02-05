import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertVoiceProfileSchema } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await prisma.voiceProfile.findUnique({ where: { voiceAgentId: params.id } });
  return NextResponse.json(profile ?? { voiceName: "", accentNotes: "", settingsJson: null });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data = upsertVoiceProfileSchema.parse(body);

    const profile = await prisma.voiceProfile.upsert({
      where: { voiceAgentId: params.id },
      update: data,
      create: { ...data, voiceAgentId: params.id },
    });
    return NextResponse.json(profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



