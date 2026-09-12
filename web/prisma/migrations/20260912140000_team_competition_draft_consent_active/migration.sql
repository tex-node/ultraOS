-- Event Registration v2 (R2): draft state, per-child guardian consent, and
-- volleyball active/substitute flag. Additive only.
--
-- Three additions, no new tables:
--   * RegistrationSubmissionStatus += DRAFT (ordered before PENDING to match schema.prisma)
--   * RegistrationParticipant += guardianName, guardianPhone, consentAccepted, consentAcceptedAt
--   * RegistrationParticipantSport += isActive
--
-- Method: taken from a read-only
--   prisma migrate diff --from-schema <committed R2 schema> --to-schema prisma/schema.prisma
-- and hand-reviewed. No existing table, column, constraint, index, RLS policy,
-- grant, or default is altered or dropped. No new RLS/grants are required
-- because no new table is created (new columns inherit the existing tenant
-- policies on their tables).
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback (pre-data rehearsal only): the columns can be dropped and the enum
-- value removed only by recreating the type; once real data exists, treat this
-- as forward-only and disable via application/status controls rather than a
-- destructive down-migration.

-- AlterEnum
ALTER TYPE "RegistrationSubmissionStatus" ADD VALUE 'DRAFT' BEFORE 'PENDING';

-- AlterTable
ALTER TABLE "RegistrationParticipant" ADD COLUMN     "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT;

-- AlterTable
ALTER TABLE "RegistrationParticipantSport" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
