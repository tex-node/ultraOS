-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('DRAFT_ANNOUNCEMENT', 'FIXTURE_ANNOUNCEMENT', 'RESULT_ANNOUNCEMENT', 'MVP_ANNOUNCEMENT', 'STANDINGS_UPDATE', 'SPONSOR_REPORT', 'FAN_CLUB_REPORT');

-- CreateEnum
CREATE TYPE "ContentJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT,
    "type" "ContentType" NOT NULL,
    "name" TEXT NOT NULL,
    "textTemplate" TEXT NOT NULL,
    "htmlTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentJob" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "ContentJobStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "textContent" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "graphicData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentTemplate_type_isActive_idx" ON "ContentTemplate"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTemplate_competitionId_type_version_key" ON "ContentTemplate"("competitionId", "type", "version");

-- CreateIndex
CREATE INDEX "ContentJob_status_createdAt_idx" ON "ContentJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentJob_sourceType_sourceId_idx" ON "ContentJob"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ContentJob_requestedById_createdAt_idx" ON "ContentJob"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_jobId_key" ON "ContentAsset"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_slug_key" ON "ContentAsset"("slug");

-- CreateIndex
CREATE INDEX "ContentAsset_createdAt_idx" ON "ContentAsset"("createdAt");

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ContentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
