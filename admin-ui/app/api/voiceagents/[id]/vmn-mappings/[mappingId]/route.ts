import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createVmnMappingSchema } from "@/lib/validation";

/**
 * PUT /api/voiceagents/[id]/vmn-mappings/[mappingId]
 * Update an existing VMN mapping
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; mappingId: string } }
) {
  try {
    const body = await req.json();
    const data = createVmnMappingSchema.parse(body);

    const vmn = data.vmn.startsWith("+") ? data.vmn : `+${data.vmn}`;

    const mapping = await prisma.vmnMapping.update({
      where: {
        id: params.mappingId,
        voiceAgentId: params.id,
      },
      data: {
        vmn,
        storeCode: data.storeCode,
      },
    });

    return NextResponse.json(mapping);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This VMN is already mapped for this voice agent" },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/voiceagents/[id]/vmn-mappings/[mappingId]
 * Delete a VMN mapping
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; mappingId: string } }
) {
  try {
    await prisma.vmnMapping.delete({
      where: {
        id: params.mappingId,
        voiceAgentId: params.id,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting VMN mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete VMN mapping" },
      { status: 500 }
    );
  }
}
