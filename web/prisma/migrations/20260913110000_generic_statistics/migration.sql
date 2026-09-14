-- Multi-sport Stage 3 (S3.1): generic, definition-driven statistics.
--
-- Adds two tables and three enums. SportMetricDefinition is a GLOBAL registry-derived catalog
-- (like Sport: no organizationId, no RLS). GameMetricValue is tenant-owned (RLS). Additive only:
-- no existing table, column, constraint, index, policy, or default is altered or dropped, and the
-- existing basketball PlayerStat/TeamStat tables are untouched.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed Stage 2 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. RLS policies and grants are database-only and are authored separately in
-- 20260913110100_generic_statistics_rls.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback:
--   * Pre-data, disposable rehearsal ONLY: drop the two tables and the three enums.
--   * Post-data: operationally IRREVERSIBLE by down-migration once metric values exist. Recover
--     only via backup restore (if approved) or a separately approved forward corrective migration.

-- CreateEnum
CREATE TYPE "StatValueType" AS ENUM ('COUNT', 'DURATION', 'DECIMAL', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "StatSubjectType" AS ENUM ('PLAYER', 'ENTRANT');

-- CreateEnum
CREATE TYPE "StatAggregation" AS ENUM ('SUM', 'MAX', 'MIN', 'AVERAGE', 'RATIO');

-- CreateTable
CREATE TABLE "SportMetricDefinition" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" "StatValueType" NOT NULL,
    "subject" "StatSubjectType" NOT NULL,
    "aggregation" "StatAggregation" NOT NULL,
    "category" TEXT,
    "derivedFromEventKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMetricValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "gameId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "subjectType" "StatSubjectType" NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "playerId" TEXT,
    "entrantId" TEXT,
    "period" INTEGER NOT NULL DEFAULT 0,
    "value" DECIMAL(12,3) NOT NULL,
    "sourceEventId" TEXT,
    "statSource" "StatDataSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMetricValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportMetricDefinition_sportId_subject_sortOrder_idx" ON "SportMetricDefinition"("sportId", "subject", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SportMetricDefinition_sportId_subject_key_key" ON "SportMetricDefinition"("sportId", "subject", "key");

-- CreateIndex
CREATE INDEX "GameMetricValue_organizationId_gameId_subjectType_idx" ON "GameMetricValue"("organizationId", "gameId", "subjectType");

-- CreateIndex
CREATE INDEX "GameMetricValue_organizationId_gameId_playerId_idx" ON "GameMetricValue"("organizationId", "gameId", "playerId");

-- CreateIndex
CREATE INDEX "GameMetricValue_organizationId_gameId_entrantId_idx" ON "GameMetricValue"("organizationId", "gameId", "entrantId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMetricValue_organizationId_gameId_metricDefinitionId_su_key" ON "GameMetricValue"("organizationId", "gameId", "metricDefinitionId", "subjectKey", "period");

-- AddForeignKey
ALTER TABLE "SportMetricDefinition" ADD CONSTRAINT "SportMetricDefinition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "SportMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMetricValue" ADD CONSTRAINT "GameMetricValue_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "GameEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
