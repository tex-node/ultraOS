-- Multi-sport Stage 6 (S6.1/S6.2): event vocabulary.
--
-- Adds nullable/additive typeKey + data columns to GameEvent and one GLOBAL catalog table,
-- SportEventDefinition (registry-derived, like Sport/SportMetricDefinition: no organizationId, no
-- RLS). No existing column, constraint, index, policy, or default is altered or dropped; the legacy
-- GameEventType enum and basketball-specific event columns remain authoritative.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed Stage 5 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. RLS: GameEvent already has a policy (Stage 4a); SportEventDefinition is global
-- and deliberately has none.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback: the added columns are nullable and safe to leave; dropping SportEventDefinition would
-- lose the event catalog (re-syncable from the registry). Recover via backup restore (if approved)
-- or a forward corrective migration.

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "data" JSONB,
ADD COLUMN     "typeKey" TEXT;

-- CreateTable
CREATE TABLE "SportEventDefinition" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scores" BOOLEAN NOT NULL DEFAULT false,
    "pointValues" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "producesMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportEventDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportEventDefinition_sportId_sortOrder_idx" ON "SportEventDefinition"("sportId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SportEventDefinition_sportId_key_key" ON "SportEventDefinition"("sportId", "key");

-- AddForeignKey
ALTER TABLE "SportEventDefinition" ADD CONSTRAINT "SportEventDefinition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
