-- CreateTable: CarModel (car model catalog per VoiceAgent)
CREATE TABLE "CarModel" (
    "id" TEXT NOT NULL,
    "voiceAgentId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "pronunciation" TEXT,
    "phonetic" TEXT,
    "vehicleType" TEXT,
    "keyFeatures" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarModel_voiceAgentId_modelName_key" ON "CarModel"("voiceAgentId", "modelName");

-- CreateIndex
CREATE INDEX "CarModel_voiceAgentId_idx" ON "CarModel"("voiceAgentId");

-- AddForeignKey
ALTER TABLE "CarModel" ADD CONSTRAINT "CarModel_voiceAgentId_fkey" FOREIGN KEY ("voiceAgentId") REFERENCES "VoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
