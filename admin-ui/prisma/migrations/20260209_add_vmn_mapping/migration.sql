-- CreateTable: VMN (Virtual Mobile Number) to Store Code mapping
-- Maps Kia phone numbers to dealer/store codes for automatic store identification

CREATE TABLE IF NOT EXISTS "VmnMapping" (
    "id" TEXT NOT NULL,
    "voiceAgentId" TEXT NOT NULL,
    "vmn" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VmnMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on voiceAgentId + vmn (each VMN mapped once per agent)
CREATE UNIQUE INDEX IF NOT EXISTS "VmnMapping_voiceAgentId_vmn_key" ON "VmnMapping"("voiceAgentId", "vmn");

-- CreateIndex: lookup by voiceAgentId
CREATE INDEX IF NOT EXISTS "VmnMapping_voiceAgentId_idx" ON "VmnMapping"("voiceAgentId");

-- CreateIndex: lookup by vmn
CREATE INDEX IF NOT EXISTS "VmnMapping_vmn_idx" ON "VmnMapping"("vmn");

-- AddForeignKey
ALTER TABLE "VmnMapping" ADD CONSTRAINT "VmnMapping_voiceAgentId_fkey"
    FOREIGN KEY ("voiceAgentId") REFERENCES "VoiceAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
