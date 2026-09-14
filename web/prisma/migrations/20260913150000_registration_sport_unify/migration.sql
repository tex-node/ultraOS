-- Multi-sport Stage 7 (S7.1): unify registration sport identity with the Sport catalog.
--
-- Adds RegistrationForm.sportIds (a denormalized mirror of the sports enum) and a nullable
-- RegistrationParticipantSport.sportId FK to the global Sport table, plus an index. Additive only:
-- no existing column, constraint, index, policy, or default is altered or dropped; the legacy
-- RegistrationSport enum remains authoritative until a later cleanup stage.
--
-- Method: taken verbatim from a read-only
--   prisma migrate diff --from-schema <committed Stage 6 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. RLS: RegistrationForm/RegistrationParticipantSport already have policies
-- (20260912120100); Sport is global and has none, so no new policy is required.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback: the added columns are nullable/defaulted and safe to leave. Recover via backup restore
-- (if approved) or a forward corrective migration.

-- AlterTable
ALTER TABLE "RegistrationForm" ADD COLUMN     "sportIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RegistrationParticipantSport" ADD COLUMN     "sportId" TEXT;

-- CreateIndex
CREATE INDEX "RegistrationParticipantSport_organizationId_sportId_idx" ON "RegistrationParticipantSport"("organizationId", "sportId");

-- AddForeignKey
ALTER TABLE "RegistrationParticipantSport" ADD CONSTRAINT "RegistrationParticipantSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
