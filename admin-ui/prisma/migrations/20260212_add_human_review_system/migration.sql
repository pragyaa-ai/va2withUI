-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'REVIEWED', 'NO_ISSUES');

-- AlterTable
ALTER TABLE "CallSession" ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NO_ISSUES',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE "DataLabel" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "voiceAgentId" TEXT,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT,
    "originalValue" TEXT,
    "originalConfidence" DECIMAL(3,2),
    "correctedValue" TEXT NOT NULL,
    "correctionReason" TEXT,
    "audioSnippet" TEXT,
    "userUtterance" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "attemptNumber" INTEGER,
    "labeledBy" TEXT NOT NULL,
    "labeledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "DataLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallSession_reviewStatus_idx" ON "CallSession"("reviewStatus");

-- CreateIndex
CREATE INDEX "DataLabel_callSessionId_idx" ON "DataLabel"("callSessionId");

-- CreateIndex
CREATE INDEX "DataLabel_voiceAgentId_idx" ON "DataLabel"("voiceAgentId");

-- CreateIndex
CREATE INDEX "DataLabel_fieldName_idx" ON "DataLabel"("fieldName");

-- CreateIndex
CREATE INDEX "DataLabel_isCorrect_idx" ON "DataLabel"("isCorrect");

-- CreateIndex
CREATE INDEX "DataLabel_labeledAt_idx" ON "DataLabel"("labeledAt");

-- AddForeignKey
ALTER TABLE "DataLabel" ADD CONSTRAINT "DataLabel_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLabel" ADD CONSTRAINT "DataLabel_voiceAgentId_fkey" FOREIGN KEY ("voiceAgentId") REFERENCES "VoiceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
