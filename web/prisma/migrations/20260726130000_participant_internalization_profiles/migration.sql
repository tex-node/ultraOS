-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('SYSTEM', 'DEMO', 'REHEARSAL', 'IMPORT', 'APPLICATION', 'ADMIN', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ApplicationProvisioningStatus" AS ENUM ('APPROVED_ONLY', 'PROFILE_PROVISIONED', 'SEASON_REGISTRATION_CREATED', 'ROLE_GRANTED', 'READY_FOR_OPERATIONS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TrainingSessionType" AS ENUM ('TEAM_PRACTICE', 'SKILLS', 'STRENGTH', 'CONDITIONING', 'SHOOTING', 'TACTICAL', 'RECOVERY', 'ASSESSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TrainingAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'EXCUSED', 'ABSENT', 'LIMITED');

-- CreateEnum
CREATE TYPE "MetricValueType" AS ENUM ('NUMERIC', 'TEXT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "AthleteMediaType" AS ENUM ('PHOTO', 'VIDEO', 'HIGHLIGHT', 'INTERVIEW', 'DOCUMENT', 'PRESS', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'TEAM', 'LEAGUE', 'SCOUT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ParticipantDocumentType" AS ENUM ('CONSENT_FORM', 'WAIVER', 'MEDICAL_CLEARANCE', 'IDENTIFICATION', 'GUARDIAN_AUTHORIZATION', 'PLAYER_CONTRACT', 'MEDIA_RELEASE', 'ELIGIBILITY_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Club" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "SeasonClub" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Event" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "DraftEvent" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Vendor" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "SponsorCampaign" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Fixture" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "ImportJob" ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'IMPORT';

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN "ultraAthleteId" TEXT, ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Staff" ADD COLUMN "ultraStaffId" TEXT, ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Application" ADD COLUMN "provisioningStatus" "ApplicationProvisioningStatus" NOT NULL DEFAULT 'APPROVED_ONLY',
  ADD COLUMN "provisionedUserId" TEXT,
  ADD COLUMN "provisionedAthleteId" TEXT,
  ADD COLUMN "provisionedPlayerId" TEXT,
  ADD COLUMN "provisionedStaffId" TEXT,
  ADD COLUMN "provisionedAt" TIMESTAMP(3),
  ADD COLUMN "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'APPLICATION';

-- CreateTable
CREATE TABLE "PublicIdCounter" (
  "namespace" TEXT NOT NULL,
  "nextValue" BIGINT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicIdCounter_pkey" PRIMARY KEY ("namespace")
);

-- CreateTable
CREATE TABLE "PublicIdAlias" (
  "id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicIdAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
  "id" TEXT NOT NULL,
  "seasonId" TEXT,
  "seasonClubId" TEXT,
  "title" TEXT NOT NULL,
  "sessionType" "TrainingSessionType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER,
  "location" TEXT,
  "coachId" TEXT,
  "notes" TEXT,
  "recordOrigin" "RecordOrigin" NOT NULL DEFAULT 'PRODUCTION',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteTrainingRecord" (
  "id" TEXT NOT NULL,
  "trainingSessionId" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "playerId" TEXT,
  "attendanceStatus" "TrainingAttendanceStatus" NOT NULL,
  "exertionRating" INTEGER,
  "coachRating" DECIMAL(5,2),
  "performanceNotes" TEXT,
  "developmentFocus" TEXT,
  "restrictions" TEXT,
  "publicSummary" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AthleteTrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingMetricDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT,
  "valueType" "MetricValueType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteTrainingMetric" (
  "id" TEXT NOT NULL,
  "athleteTrainingRecordId" TEXT NOT NULL,
  "metricDefinitionId" TEXT NOT NULL,
  "numericValue" DECIMAL(10,2),
  "textValue" TEXT,
  "booleanValue" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AthleteTrainingMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteMedia" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "playerId" TEXT,
  "fixtureId" TEXT,
  "trainingSessionId" TEXT,
  "type" "AthleteMediaType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "capturedAt" TIMESTAMP(3),
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AthleteMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantDocument" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT,
  "staffId" TEXT,
  "type" "ParticipantDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "approvalStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3),
  "uploadedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParticipantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_ultraAthleteId_key" ON "Athlete"("ultraAthleteId");
CREATE UNIQUE INDEX "Staff_ultraStaffId_key" ON "Staff"("ultraStaffId");
CREATE INDEX "Application_provisioningStatus_idx" ON "Application"("provisioningStatus");
CREATE UNIQUE INDEX "PublicIdAlias_alias_key" ON "PublicIdAlias"("alias");
CREATE INDEX "PublicIdAlias_entityType_entityId_idx" ON "PublicIdAlias"("entityType", "entityId");
CREATE INDEX "TrainingSession_seasonId_occurredAt_idx" ON "TrainingSession"("seasonId", "occurredAt");
CREATE INDEX "TrainingSession_seasonClubId_occurredAt_idx" ON "TrainingSession"("seasonClubId", "occurredAt");
CREATE INDEX "TrainingSession_coachId_occurredAt_idx" ON "TrainingSession"("coachId", "occurredAt");
CREATE UNIQUE INDEX "AthleteTrainingRecord_trainingSessionId_athleteId_key" ON "AthleteTrainingRecord"("trainingSessionId", "athleteId");
CREATE INDEX "AthleteTrainingRecord_athleteId_createdAt_idx" ON "AthleteTrainingRecord"("athleteId", "createdAt");
CREATE INDEX "AthleteTrainingRecord_playerId_idx" ON "AthleteTrainingRecord"("playerId");
CREATE UNIQUE INDEX "TrainingMetricDefinition_key_key" ON "TrainingMetricDefinition"("key");
CREATE UNIQUE INDEX "AthleteTrainingMetric_athleteTrainingRecordId_metricDefinitionId_key" ON "AthleteTrainingMetric"("athleteTrainingRecordId", "metricDefinitionId");
CREATE INDEX "AthleteMedia_athleteId_visibility_approved_idx" ON "AthleteMedia"("athleteId", "visibility", "approved");
CREATE INDEX "AthleteMedia_playerId_idx" ON "AthleteMedia"("playerId");
CREATE INDEX "AthleteMedia_fixtureId_idx" ON "AthleteMedia"("fixtureId");
CREATE INDEX "ParticipantDocument_athleteId_type_idx" ON "ParticipantDocument"("athleteId", "type");
CREATE INDEX "ParticipantDocument_staffId_type_idx" ON "ParticipantDocument"("staffId", "type");
CREATE INDEX "ParticipantDocument_approvalStatus_expiresAt_idx" ON "ParticipantDocument"("approvalStatus", "expiresAt");

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingRecord" ADD CONSTRAINT "AthleteTrainingRecord_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingRecord" ADD CONSTRAINT "AthleteTrainingRecord_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingRecord" ADD CONSTRAINT "AthleteTrainingRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingRecord" ADD CONSTRAINT "AthleteTrainingRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingMetric" ADD CONSTRAINT "AthleteTrainingMetric_athleteTrainingRecordId_fkey" FOREIGN KEY ("athleteTrainingRecordId") REFERENCES "AthleteTrainingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteTrainingMetric" ADD CONSTRAINT "AthleteTrainingMetric_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "TrainingMetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipantDocument" ADD CONSTRAINT "ParticipantDocument_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantDocument" ADD CONSTRAINT "ParticipantDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantDocument" ADD CONSTRAINT "ParticipantDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
