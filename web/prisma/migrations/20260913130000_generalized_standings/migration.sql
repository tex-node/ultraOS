-- Multi-sport Stage 5 (S5.1): generalized standings outcomes and sport-specific metrics.
--
-- Adds defaulted/nullable columns to Standing (drawn, ties, noResult, rank, rankTiebreak) and one
-- tenant-owned table (StandingMetric). Additive only: no existing column, constraint, index,
-- policy, or default is altered or dropped. Standing already carries RLS (Stage 4a); only the new
-- table needs a policy (authored separately in 20260913130100_generalized_standings_rls).
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed Stage 4 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback: the Standing columns are defaulted/nullable and safe to leave; dropping StandingMetric
-- would lose sport-specific standings values (NRR, set ratio). Recover only via backup restore (if
-- approved) or a forward corrective migration.

-- AlterTable
ALTER TABLE "Standing" ADD COLUMN     "drawn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noResult" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank" INTEGER,
ADD COLUMN     "rankTiebreak" TEXT,
ADD COLUMN     "ties" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StandingMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "standingId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingMetric_organizationId_metricKey_idx" ON "StandingMetric"("organizationId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "StandingMetric_standingId_metricKey_key" ON "StandingMetric"("standingId", "metricKey");

-- AddForeignKey
ALTER TABLE "StandingMetric" ADD CONSTRAINT "StandingMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingMetric" ADD CONSTRAINT "StandingMetric_standingId_fkey" FOREIGN KEY ("standingId") REFERENCES "Standing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
