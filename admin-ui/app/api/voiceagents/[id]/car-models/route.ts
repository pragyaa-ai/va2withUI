import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createCarModelSchema = z.object({
  modelName: z.string().min(1, "Model name is required").max(50),
  pronunciation: z.string().max(100).nullish(),
  phonetic: z.string().max(100).nullish(),
  vehicleType: z.string().max(100).nullish(),
  keyFeatures: z.string().max(2000).nullish(),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

/**
 * GET /api/voiceagents/[id]/car-models
 * List all car models for this voice agent
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const models = await prisma.carModel.findMany({
      where: { voiceAgentId: params.id },
      orderBy: { displayOrder: "asc" },
    });
    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching car models:", error);
    return NextResponse.json(
      { error: "Failed to fetch car models" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/voiceagents/[id]/car-models
 * Create a new car model entry
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const data = createCarModelSchema.parse(body);

    const model = await prisma.carModel.create({
      data: {
        voiceAgentId: params.id,
        modelName: data.modelName.toUpperCase().trim(),
        pronunciation: data.pronunciation || null,
        phonetic: data.phonetic || null,
        vehicleType: data.vehicleType || null,
        keyFeatures: data.keyFeatures || null,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (err: unknown) {
    // Handle unique constraint violation (duplicate model name for this agent)
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This car model already exists for this voice agent" },
        { status: 409 }
      );
    }

    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
