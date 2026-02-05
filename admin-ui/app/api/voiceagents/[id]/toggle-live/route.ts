import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { isLive } = body;

    if (typeof isLive !== "boolean") {
      return NextResponse.json(
        { error: "isLive must be a boolean" },
        { status: 400 }
      );
    }

    const updated = await prisma.voiceAgent.update({
      where: { id: params.id },
      data: { isLive },
      select: {
        id: true,
        name: true,
        isLive: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error toggling isLive:", error);
    return NextResponse.json(
      { error: "Failed to update VoiceAgent" },
      { status: 500 }
    );
  }
}
