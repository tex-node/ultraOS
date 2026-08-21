-- CreateEnum
CREATE TYPE "LaunchBlockerPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'season-zero',
    "competitionId" TEXT,
    "seasonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchReadinessCheck" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT,
    "eventId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "priority" "LaunchBlockerPriority" NOT NULL DEFAULT 'P2',
    "status" "OpsItemStatus" NOT NULL DEFAULT 'OPEN',
    "ownerUserId" TEXT,
    "evidenceUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE INDEX "SystemSetting_competitionId_idx" ON "SystemSetting"("competitionId");

-- CreateIndex
CREATE INDEX "SystemSetting_seasonId_idx" ON "SystemSetting"("seasonId");

-- CreateIndex
CREATE INDEX "LaunchReadinessCheck_seasonId_category_idx" ON "LaunchReadinessCheck"("seasonId", "category");

-- CreateIndex
CREATE INDEX "LaunchReadinessCheck_eventId_category_idx" ON "LaunchReadinessCheck"("eventId", "category");

-- CreateIndex
CREATE INDEX "LaunchReadinessCheck_priority_status_idx" ON "LaunchReadinessCheck"("priority", "status");

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchReadinessCheck" ADD CONSTRAINT "LaunchReadinessCheck_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
