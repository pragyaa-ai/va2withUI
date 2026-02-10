import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateCarModelSchema = z.object({
  modelName: z.string().min(1).max(50).optional(),
  pronunciation: z.string().max(100).nullish(),
  phonetic: z.string().max(100).nullish(),
  vehicleType: z.string().max(100).nullish(),
  keyFeatures: z.string().max(2000).nullish(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/voiceagents/[id]/car-models/[modelId]
 * Update an existing car model
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; modelId: string } }
) {
  try {
    const body = await req.json();
    const data = updateCarModelSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.modelName !== undefined) updateData.modelName = data.modelName.toUpperCase().trim();
    if (data.pronunciation !== undefined) updateData.pronunciation = data.pronunciation || null;
    if (data.phonetic !== undefined) updateData.phonetic = data.phonetic || null;
    if (data.vehicleType !== undefined) updateData.vehicleType = data.vehicleType || null;
    if (data.keyFeatures !== undefined) updateData.keyFeatures = data.keyFeatures || null;
    if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const model = await prisma.carModel.update({
      where: {
        id: params.modelId,
        voiceAgentId: params.id,
      },
      data: updateData,
    });

    return NextResponse.json(model);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This car model name already exists for this voice agent" },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/voiceagents/[id]/car-models/[modelId]
 * Delete a car model
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; modelId: string } }
) {
  try {
    await prisma.carModel.delete({
      where: {
        id: params.modelId,
        voiceAgentId: params.id,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting car model:", error);
    return NextResponse.json(
      { error: "Failed to delete car model" },
      { status: 500 }
    );
  }
}
