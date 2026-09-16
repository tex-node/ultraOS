-- Multi-sport Stage B2: a fixture side may be a SeasonClub (team sports) or an Entrant
-- (individual/pair/relay sports). See documentation/architecture/ENTRANT_FIXTURE_SIDES_PLAN.md.
--
-- Additive: widen the SeasonClub side columns to nullable (no row data changes) and add a CHECK that
-- each side references at least one party. Every existing fixture has SeasonClub sides, so the CHECK
-- validates without modification. The entrant-side columns already exist (Stage 2).
--
-- RLS is unchanged (Fixture already carries its policy); the entrant columns are simple nullable FKs.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.
--
-- Rollback: the columns' data is untouched; to revert, first confirm no fixture has a null SeasonClub
-- side (individual-sport fixtures would block it), then DROP the CHECK constraints and re-add NOT NULL.

-- AlterTable
ALTER TABLE "Fixture" ALTER COLUMN "homeSeasonClubId" DROP NOT NULL;
ALTER TABLE "Fixture" ALTER COLUMN "awaySeasonClubId" DROP NOT NULL;

-- Each side must reference a party: a SeasonClub or an Entrant.
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_home_side_party_chk" CHECK ("homeSeasonClubId" IS NOT NULL OR "homeEntrantId" IS NOT NULL);
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_away_side_party_chk" CHECK ("awaySeasonClubId" IS NOT NULL OR "awayEntrantId" IS NOT NULL);
