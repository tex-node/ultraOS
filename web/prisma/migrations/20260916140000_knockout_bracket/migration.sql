-- Multi-sport knockout brackets: persist bracket metadata so the next round can be generated
-- automatically from winners.
--
--  - "Fixture"."round" / "bracketPosition": 1-based round and 1-based slot within the round.
--    Winners of positions 2k-1 and 2k meet at position k of the following round.
--  - "Division"."knockoutByes": round-1 slots with a bye (no first-round fixture), keyed by
--    bracketPosition. Byes auto-advance into round two.
--
-- Additive and nullable; existing round-robin fixtures keep NULL bracket metadata.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN "round" INTEGER;
ALTER TABLE "Fixture" ADD COLUMN "bracketPosition" INTEGER;
ALTER TABLE "Fixture" ADD COLUMN "groupLabel" TEXT;
ALTER TABLE "Division" ADD COLUMN "knockoutByes" JSONB;

-- CreateIndex
CREATE INDEX "Fixture_divisionId_round_bracketPosition_idx" ON "Fixture"("divisionId", "round", "bracketPosition");
