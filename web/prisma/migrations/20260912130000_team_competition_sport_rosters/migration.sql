-- Event Registration v2 (R2): all-female team competition - per-sport roster
-- assignments. Additive only.
--
-- Adds one enum (RegistrationSport), one tenant-owned join table
-- (RegistrationParticipantSport), and two nullable/defaulted columns on the
-- existing RegistrationForm (sports[], sportConfig). No existing table,
-- column, constraint, index, RLS policy, or default is altered or dropped.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed R1 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. RLS policies and grants are database-only and are authored
-- separately in 20260912130100_team_competition_sport_rosters_rls.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback:
--   * Pre-data, disposable rehearsal ONLY: drop the new table + enum and the two
--     RegistrationForm columns (sportConfig, sports).
--   * Post-data, once any real team registration exists: operationally
--     IRREVERSIBLE by down-migration. Do NOT drop RegistrationParticipantSport -
--     that destroys roster assignments. Recover only via backup restore (if
--     approved) or a separately approved forward corrective migration; otherwise
--     disable the feature through form/status controls.

-- CreateEnum
CREATE TYPE "RegistrationSport" AS ENUM ('VOLLEYBALL', 'FLAG_RACE');

-- AlterTable
ALTER TABLE "RegistrationForm" ADD COLUMN     "sportConfig" JSONB,
ADD COLUMN     "sports" "RegistrationSport"[];

-- CreateTable
CREATE TABLE "RegistrationParticipantSport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "participantId" TEXT NOT NULL,
    "sport" "RegistrationSport" NOT NULL,
    "rosterOrder" INTEGER NOT NULL DEFAULT 0,
    "position" TEXT,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationParticipantSport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationParticipantSport_organizationId_sport_rosterOrd_idx" ON "RegistrationParticipantSport"("organizationId", "sport", "rosterOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationParticipantSport_organizationId_id_key" ON "RegistrationParticipantSport"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationParticipantSport_organizationId_participantId_s_key" ON "RegistrationParticipantSport"("organizationId", "participantId", "sport");

-- AddForeignKey
ALTER TABLE "RegistrationParticipantSport" ADD CONSTRAINT "RegistrationParticipantSport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationParticipantSport" ADD CONSTRAINT "RegistrationParticipantSport_organizationId_participantId_fkey" FOREIGN KEY ("organizationId", "participantId") REFERENCES "RegistrationParticipant"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
