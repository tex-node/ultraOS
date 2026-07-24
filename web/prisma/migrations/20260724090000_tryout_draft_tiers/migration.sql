-- Add explicit tryout selection groups and draft tiers.
CREATE TYPE "DraftSelectionGroup" AS ENUM ('PENDING_SELECTION', 'MAIN_DRAFT', 'SECONDARY_DRAFT', 'NOT_SELECTED');
CREATE TYPE "DraftTier" AS ENUM ('MAIN', 'SECONDARY');

ALTER TABLE "Player"
  ADD COLUMN "draftSelectionGroup" "DraftSelectionGroup" NOT NULL DEFAULT 'PENDING_SELECTION',
  ADD COLUMN "tryoutNumber" TEXT,
  ADD COLUMN "tryoutScore" DECIMAL(5, 2),
  ADD COLUMN "selectionNotes" TEXT,
  ADD COLUMN "selectedAt" TIMESTAMP(3),
  ADD COLUMN "selectedById" TEXT,
  ADD COLUMN "draftedAt" TIMESTAMP(3);

ALTER TABLE "Draft"
  ADD COLUMN "tier" "DraftTier" NOT NULL DEFAULT 'MAIN';

ALTER TABLE "Player"
  ADD CONSTRAINT "Player_selectedById_fkey"
  FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Player_seasonId_draftSelectionGroup_idx" ON "Player"("seasonId", "draftSelectionGroup");
CREATE INDEX "Player_selectedById_selectedAt_idx" ON "Player"("selectedById", "selectedAt");
CREATE INDEX "Draft_seasonId_divisionId_tier_status_idx" ON "Draft"("seasonId", "divisionId", "tier", "status");

DROP INDEX IF EXISTS "Draft_seasonId_divisionId_status_idx";
