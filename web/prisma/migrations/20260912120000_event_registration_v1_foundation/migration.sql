-- Event Registration v1 (R1): sport-neutral registration foundation.
--
-- Additive only. Creates six enums, four tenant-owned tables
-- (RegistrationForm, RegistrationField, RegistrationSubmission,
-- RegistrationParticipant), their indexes and foreign keys, and a nullable
-- organization-scoped `Event.slug`. No existing table, column, constraint, or
-- index is altered or dropped.
--
-- Method: the DDL below was taken from a read-only
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
-- run against the candidate schema and hand-reviewed. RLS policies and role
-- grants are a database-only concept with no Prisma representation, so they are
-- authored separately in 20260912120100_event_registration_v1_rls.
--
-- NOT APPLIED anywhere by this commit. Staging rehearsal and the live
-- read-only `prisma migrate diff --from-config-datasource --to-schema` drift
-- check happen before apply, per the R1 plan.
--
-- Rollback:
--   * Pre-data, disposable staging rehearsal ONLY: drop the four tables + six
--     types and drop the Event.slug unique index/column.
--   * Post-data, once any real registration exists: this migration is
--     operationally IRREVERSIBLE by down-migration. Do NOT drop the
--     registration tables - that destroys submitted registrations. Recover only
--     via backup restore (if data loss is acceptable and explicitly approved)
--     or a separately approved forward corrective migration; otherwise disable
--     the feature through form/status controls.
-- The migration is purely additive; no existing table, column, constraint, or
-- index is altered or dropped.

-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "RegistrationFormStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RegistrationSubmissionStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RegistrationFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'CONSENT');

-- CreateEnum
CREATE TYPE "RegistrationFieldScope" AS ENUM ('SUBMISSION', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "RegistrationParticipantRole" AS ENUM ('PARTICIPANT', 'COACH', 'MANAGER');

-- CreateTable
CREATE TABLE "RegistrationForm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "RegistrationMode" NOT NULL DEFAULT 'INDIVIDUAL',
    "status" "RegistrationFormStatus" NOT NULL DEFAULT 'DRAFT',
    "publicEnabled" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minTeamSize" INTEGER,
    "maxTeamSize" INTEGER,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "confirmationMessage" TEXT,
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "formId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "RegistrationFieldType" NOT NULL DEFAULT 'TEXT',
    "scope" "RegistrationFieldScope" NOT NULL DEFAULT 'SUBMISSION',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "validation" JSONB,
    "conditionalOn" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "formId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "mode" "RegistrationMode" NOT NULL,
    "status" "RegistrationSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "referenceNumber" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "teamName" TEXT,
    "teamClubOrSchool" TEXT,
    "teamCategory" TEXT,
    "answers" JSONB,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "consentName" TEXT,
    "consentAcceptedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "submissionId" TEXT NOT NULL,
    "role" "RegistrationParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "category" TEXT,
    "clubOrSchool" TEXT,
    "jerseyNumber" INTEGER,
    "answers" JSONB,
    "athleteId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationForm_organizationId_status_idx" ON "RegistrationForm"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationForm_organizationId_id_key" ON "RegistrationForm"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationForm_organizationId_eventId_key" ON "RegistrationForm"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "RegistrationField_organizationId_formId_sortOrder_idx" ON "RegistrationField"("organizationId", "formId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationField_organizationId_id_key" ON "RegistrationField"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationField_organizationId_formId_key_key" ON "RegistrationField"("organizationId", "formId", "key");

-- CreateIndex
CREATE INDEX "RegistrationSubmission_organizationId_formId_status_idx" ON "RegistrationSubmission"("organizationId", "formId", "status");

-- CreateIndex
CREATE INDEX "RegistrationSubmission_organizationId_eventId_idx" ON "RegistrationSubmission"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "RegistrationSubmission_organizationId_createdAt_idx" ON "RegistrationSubmission"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationSubmission_organizationId_id_key" ON "RegistrationSubmission"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationSubmission_organizationId_referenceNumber_key" ON "RegistrationSubmission"("organizationId", "referenceNumber");

-- CreateIndex
CREATE INDEX "RegistrationParticipant_organizationId_submissionId_sortOrd_idx" ON "RegistrationParticipant"("organizationId", "submissionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationParticipant_organizationId_id_key" ON "RegistrationParticipant"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "RegistrationForm" ADD CONSTRAINT "RegistrationForm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationForm" ADD CONSTRAINT "RegistrationForm_organizationId_eventId_fkey" FOREIGN KEY ("organizationId", "eventId") REFERENCES "Event"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationField" ADD CONSTRAINT "RegistrationField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationField" ADD CONSTRAINT "RegistrationField_organizationId_formId_fkey" FOREIGN KEY ("organizationId", "formId") REFERENCES "RegistrationForm"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSubmission" ADD CONSTRAINT "RegistrationSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSubmission" ADD CONSTRAINT "RegistrationSubmission_organizationId_formId_fkey" FOREIGN KEY ("organizationId", "formId") REFERENCES "RegistrationForm"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSubmission" ADD CONSTRAINT "RegistrationSubmission_organizationId_eventId_fkey" FOREIGN KEY ("organizationId", "eventId") REFERENCES "Event"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSubmission" ADD CONSTRAINT "RegistrationSubmission_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationSubmission" ADD CONSTRAINT "RegistrationSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationParticipant" ADD CONSTRAINT "RegistrationParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationParticipant" ADD CONSTRAINT "RegistrationParticipant_organizationId_submissionId_fkey" FOREIGN KEY ("organizationId", "submissionId") REFERENCES "RegistrationSubmission"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- NOTE (named limitation): athleteId stays a simple, non-composite FK because
-- Athlete has no @@unique([organizationId, id]); a composite FK with
-- ON DELETE SET NULL is invalid against the NOT NULL organizationId. Any future
-- link write must be application-level assertSameOrganization-guarded.
ALTER TABLE "RegistrationParticipant" ADD CONSTRAINT "RegistrationParticipant_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable (Event Registration v1): nullable organization-scoped public slug.
ALTER TABLE "Event" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_organizationId_slug_key" ON "Event"("organizationId", "slug");
