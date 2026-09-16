-- Multi-sport Stage B4: a standing belongs to a SeasonClub (team sports) or an Entrant (individual
-- sports). See documentation/architecture/ENTRANT_FIXTURE_SIDES_PLAN.md.
--
-- Additive: widen Standing.seasonClubId to nullable, add a unique index on entrantId (one standing
-- per entrant where present; Postgres allows many NULLs), and a CHECK that each row references at
-- least one party. Existing rows all have a SeasonClub, so the CHECK validates without change.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.
--
-- Rollback: confirm no standing has a null SeasonClub side (individual standings would block it),
-- then DROP the CHECK + unique index and re-add NOT NULL.

-- AlterTable
ALTER TABLE "Standing" ALTER COLUMN "seasonClubId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Standing_entrantId_key" ON "Standing"("entrantId");

-- Each standing references a party: a SeasonClub or an Entrant.
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_party_chk" CHECK ("seasonClubId" IS NOT NULL OR "entrantId" IS NOT NULL);
