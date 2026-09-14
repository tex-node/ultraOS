-- Multi-sport Stage 2 (S2.1/S2.2): the Entrant abstraction.
--
-- Adds two tenant-owned tables (Entrant, EntrantMember), three enums, nullable entrant references
-- on Fixture/GameEvent/Standing/TeamStat, and one composite unique on Competition needed to back
-- Entrant.competitionId's tenant-aware FK. Additive only: no existing column, constraint, index,
-- RLS policy, or default is altered or dropped.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed S1.3 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. RLS policies and grants are database-only and are authored separately in
-- 20260913100100_entrant_abstraction_rls.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback:
--   * Pre-data, disposable rehearsal ONLY: drop the two tables, the three enums, the four new
--     columns, and the Competition composite unique.
--   * Post-data, once entrants/backfill exist: operationally IRREVERSIBLE by down-migration.
--     Recover only via backup restore (if approved) or a separately approved forward corrective
--     migration. The nullable entrantId columns are additive and harmless to leave in place.

-- CreateEnum
CREATE TYPE "EntrantType" AS ENUM ('TEAM', 'INDIVIDUAL', 'PAIR', 'RELAY');

-- CreateEnum
CREATE TYPE "EntrantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EntrantMemberRole" AS ENUM ('PLAYER', 'CAPTAIN', 'PARTNER', 'COACH', 'MANAGER');

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayEntrantId" TEXT,
ADD COLUMN     "homeEntrantId" TEXT,
ADD COLUMN     "winnerEntrantId" TEXT;

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "entrantId" TEXT;

-- AlterTable
ALTER TABLE "TeamStat" ADD COLUMN     "entrantId" TEXT;

-- AlterTable
ALTER TABLE "Standing" ADD COLUMN     "entrantId" TEXT;

-- CreateTable
CREATE TABLE "Entrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "type" "EntrantType" NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "seasonClubId" TEXT,
    "status" "EntrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntrantMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "entrantId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "role" "EntrantMemberRole" NOT NULL DEFAULT 'PLAYER',
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntrantMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entrant_seasonId_divisionId_status_idx" ON "Entrant"("seasonId", "divisionId", "status");

-- CreateIndex
CREATE INDEX "Entrant_organizationId_competitionId_idx" ON "Entrant"("organizationId", "competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrant_seasonClubId_key" ON "Entrant"("seasonClubId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrant_organizationId_id_key" ON "Entrant"("organizationId", "id");

-- CreateIndex
CREATE INDEX "EntrantMember_organizationId_entrantId_order_idx" ON "EntrantMember"("organizationId", "entrantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EntrantMember_organizationId_entrantId_athleteId_key" ON "EntrantMember"("organizationId", "entrantId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "EntrantMember_organizationId_id_key" ON "EntrantMember"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_organizationId_id_key" ON "Competition"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_organizationId_competitionId_fkey" FOREIGN KEY ("organizationId", "competitionId") REFERENCES "Competition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_organizationId_seasonId_fkey" FOREIGN KEY ("organizationId", "seasonId") REFERENCES "Season"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_organizationId_divisionId_fkey" FOREIGN KEY ("organizationId", "divisionId") REFERENCES "Division"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrantMember" ADD CONSTRAINT "EntrantMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrantMember" ADD CONSTRAINT "EntrantMember_organizationId_entrantId_fkey" FOREIGN KEY ("organizationId", "entrantId") REFERENCES "Entrant"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrantMember" ADD CONSTRAINT "EntrantMember_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeEntrantId_fkey" FOREIGN KEY ("homeEntrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayEntrantId_fkey" FOREIGN KEY ("awayEntrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_winnerEntrantId_fkey" FOREIGN KEY ("winnerEntrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStat" ADD CONSTRAINT "TeamStat_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
