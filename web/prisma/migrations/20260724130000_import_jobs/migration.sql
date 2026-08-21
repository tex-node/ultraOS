CREATE TYPE "ImportType" AS ENUM ('PLAYER', 'COACH', 'CLUB');
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSED', 'NEEDS_REVIEW', 'READY', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'WARNING', 'ERROR', 'RESOLVED', 'IMPORTED', 'SKIPPED', 'FAILED');
CREATE TYPE "ImportResolutionAction" AS ENUM ('CREATE', 'LINK_EXISTING', 'UPDATE_EXISTING', 'SKIP', 'REJECT');

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "type" "ImportType" NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
  "fileName" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL,
  "importJobId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB,
  "status" "ImportRowStatus" NOT NULL,
  "errors" JSONB,
  "warnings" JSONB,
  "matchedEntityType" TEXT,
  "matchedEntityId" TEXT,
  "resolutionAction" "ImportResolutionAction",
  "resolutionData" JSONB,
  "importedEntityType" TEXT,
  "importedEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_type_status_createdAt_idx" ON "ImportJob"("type", "status", "createdAt");
CREATE INDEX "ImportJob_uploadedById_createdAt_idx" ON "ImportJob"("uploadedById", "createdAt");
CREATE UNIQUE INDEX "ImportRow_importJobId_rowNumber_key" ON "ImportRow"("importJobId", "rowNumber");
CREATE INDEX "ImportRow_importJobId_status_idx" ON "ImportRow"("importJobId", "status");
CREATE INDEX "ImportRow_matchedEntityType_matchedEntityId_idx" ON "ImportRow"("matchedEntityType", "matchedEntityId");

ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportRow"
  ADD CONSTRAINT "ImportRow_importJobId_fkey"
  FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
