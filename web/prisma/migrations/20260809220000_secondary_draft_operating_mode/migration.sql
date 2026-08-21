-- Link Draft to its governing DraftEvent, so Secondary Draft (Draft/DraftPick)
-- can derive REHEARSAL/LIVE behavior from the same operatingMode the Main
-- Draft (DraftEvent/DraftAllocation) already uses, instead of being an
-- unguarded, separate system.
ALTER TABLE "Draft" ADD COLUMN "draftEventId" TEXT;
CREATE INDEX "Draft_draftEventId_idx" ON "Draft"("draftEventId");
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reserve/reveal/confirm/correct state machine for DraftPick, mirroring
-- DraftAllocation. createdById is nullable from the start: production has
-- pre-existing (demo-batch) DraftPick rows with no natural actor to backfill,
-- and adding a NOT NULL column with no default fails ALTER TABLE against a
-- non-empty table. Do not fabricate a placeholder actor to work around this.
CREATE TYPE "DraftPickStatus" AS ENUM ('RESERVED', 'REVEALING', 'REVEALED', 'CONFIRMED', 'CORRECTED');

ALTER TABLE "DraftPick"
  ADD COLUMN "operatingMode" "DraftEventOperatingMode" NOT NULL DEFAULT 'REHEARSAL',
  ADD COLUMN "status" "DraftPickStatus" NOT NULL DEFAULT 'RESERVED',
  ADD COLUMN "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revealedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "correctedAt" TIMESTAMP(3),
  ADD COLUMN "correctionReason" TEXT,
  ADD COLUMN "createdById" TEXT;

CREATE INDEX "DraftPick_draftId_status_idx" ON "DraftPick"("draftId", "status");
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
