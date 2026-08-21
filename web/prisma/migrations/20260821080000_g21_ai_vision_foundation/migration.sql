-- G.21: AI Vision & Player Intelligence Foundation. Purely additive - new enums, new tables,
-- one new enum value on the existing MediaAssetPurpose enum. Nothing here alters, drops, or
-- renames any existing column, table, or index. Existing competitive-truth tables (Fixture,
-- Game, GameEvent, PlayerStat, TeamStat, Standing) are untouched by this migration; the new
-- VisionEventMatch table gains an additive foreign key onto GameEvent(id), never a column on
-- GameEvent itself.
--
-- Note: the raw `prisma migrate diff` output against production also included two DROP INDEX
-- statements (Application_type_status_coachSeasonZeroSelectionStatus_idx,
-- Club_brandingStatus_idx) and five RenameIndex statements for long auto-generated constraint
-- names - both are pre-existing schema/DB drift unrelated to G.21 (from an earlier track's
-- schema.prisma edit that was never accompanied by its own migration). Deliberately excluded
-- from this migration to keep it scoped to only what G.21 actually adds; that pre-existing drift
-- is a separate, disclosed finding for a future track to address on its own.

-- CreateEnum
CREATE TYPE "VideoSourceType" AS ENUM ('FULL_GAME', 'CAMERA_ISO', 'BROADCAST_PROGRAM', 'PHONE_RECORDING', 'TRAINING_CLIP', 'HIGHLIGHT_CLIP');

-- CreateEnum
CREATE TYPE "VisionCapability" AS ENUM ('NO_VISION', 'VIDEO_REGISTERED', 'VISION_ANALYZED', 'VISION_REVIEWED', 'SPATIAL_TRACKING');

-- CreateEnum
CREATE TYPE "TimelineAnchorSource" AS ENUM ('MANUAL', 'AUTO_DETECTED');

-- CreateEnum
CREATE TYPE "VisionAnalysisRunStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisionObservationType" AS ENUM ('PERSON_DETECTED', 'PLAYER_TRACK', 'BALL_DETECTED', 'SHOT_ATTEMPT_CANDIDATE', 'SHOT_MADE_CANDIDATE', 'REBOUND_CANDIDATE', 'PASS_CANDIDATE', 'COURT_POSITION', 'JERSEY_NUMBER_CANDIDATE');

-- CreateEnum
CREATE TYPE "VisionObservationStatus" AS ENUM ('PENDING', 'MATCHED', 'REJECTED', 'CONFIRMED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "VisionMatchBand" AS ENUM ('STRONG_MATCH', 'POSSIBLE_MATCH', 'AMBIGUOUS', 'NO_MATCH');

-- AlterEnum
ALTER TYPE "MediaAssetPurpose" ADD VALUE 'GAME_VIDEO';

-- CreateTable
CREATE TABLE "GameVideo" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "gameId" TEXT,
    "mediaAssetId" TEXT NOT NULL,
    "sourceType" "VideoSourceType" NOT NULL,
    "durationSeconds" INTEGER,
    "frameRate" DOUBLE PRECISION,
    "resolutionWidth" INTEGER,
    "resolutionHeight" INTEGER,
    "recordingStartedAt" TIMESTAMP(3),
    "cameraLabel" TEXT,
    "analysisEligible" BOOLEAN NOT NULL DEFAULT true,
    "visionCapability" "VisionCapability" NOT NULL DEFAULT 'VIDEO_REGISTERED',
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTimelineAnchor" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "videoTimeMs" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "gameClockSeconds" INTEGER NOT NULL,
    "source" "TimelineAnchorSource" NOT NULL DEFAULT 'MANUAL',
    "confidence" DOUBLE PRECISION,
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoTimelineAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtCalibration" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "referencePoints" JSONB NOT NULL,
    "basketLocations" JSONB,
    "courtWidthUnits" DOUBLE PRECISION,
    "courtLengthUnits" DOUBLE PRECISION,
    "units" TEXT NOT NULL DEFAULT 'meters',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionModel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "configHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionAnalysisRun" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "visionModelId" TEXT NOT NULL,
    "status" "VisionAnalysisRunStatus" NOT NULL DEFAULT 'QUEUED',
    "configHash" TEXT,
    "requestedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionTrack" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "startVideoTimeMs" INTEGER NOT NULL,
    "endVideoTimeMs" INTEGER NOT NULL,
    "teamCandidateSeasonClubId" TEXT,
    "playerCandidatePlayerId" TEXT,
    "identityConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionObservation" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "trackId" TEXT,
    "videoTimeMs" INTEGER NOT NULL,
    "videoTimeEndMs" INTEGER,
    "observationType" "VisionObservationType" NOT NULL,
    "boundingBox" JSONB,
    "courtX" DOUBLE PRECISION,
    "courtY" DOUBLE PRECISION,
    "teamCandidateSeasonClubId" TEXT,
    "playerCandidatePlayerId" TEXT,
    "jerseyCandidateNumber" INTEGER,
    "eventCandidateType" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rawMetadata" JSONB,
    "status" "VisionObservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionEventMatch" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "gameEventId" TEXT NOT NULL,
    "matchBand" "VisionMatchBand" NOT NULL,
    "temporalErrorMs" INTEGER,
    "playerMatch" BOOLEAN,
    "teamMatch" BOOLEAN,
    "eventTypeMatch" BOOLEAN,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewStatus" "VisionObservationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionEventMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionSpatialSummary" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "playerId" TEXT,
    "averageCourtX" DOUBLE PRECISION,
    "averageCourtY" DOUBLE PRECISION,
    "distanceCoveredUnits" DOUBLE PRECISION,
    "samplesUsed" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionSpatialSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameVideo_mediaAssetId_key" ON "GameVideo"("mediaAssetId");

-- CreateIndex
CREATE INDEX "GameVideo_fixtureId_idx" ON "GameVideo"("fixtureId");

-- CreateIndex
CREATE INDEX "GameVideo_gameId_idx" ON "GameVideo"("gameId");

-- CreateIndex
CREATE INDEX "GameVideo_visionCapability_idx" ON "GameVideo"("visionCapability");

-- CreateIndex
CREATE INDEX "VideoTimelineAnchor_gameVideoId_videoTimeMs_idx" ON "VideoTimelineAnchor"("gameVideoId", "videoTimeMs");

-- CreateIndex
CREATE UNIQUE INDEX "CourtCalibration_gameVideoId_key" ON "CourtCalibration"("gameVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "VisionModel_key_key" ON "VisionModel"("key");

-- CreateIndex
CREATE INDEX "VisionAnalysisRun_gameVideoId_status_idx" ON "VisionAnalysisRun"("gameVideoId", "status");

-- CreateIndex
CREATE INDEX "VisionTrack_gameVideoId_idx" ON "VisionTrack"("gameVideoId");

-- CreateIndex
CREATE INDEX "VisionTrack_analysisRunId_idx" ON "VisionTrack"("analysisRunId");

-- CreateIndex
CREATE INDEX "VisionObservation_gameVideoId_videoTimeMs_idx" ON "VisionObservation"("gameVideoId", "videoTimeMs");

-- CreateIndex
CREATE INDEX "VisionObservation_analysisRunId_idx" ON "VisionObservation"("analysisRunId");

-- CreateIndex
CREATE INDEX "VisionObservation_status_idx" ON "VisionObservation"("status");

-- CreateIndex
CREATE INDEX "VisionObservation_observationType_idx" ON "VisionObservation"("observationType");

-- CreateIndex
CREATE INDEX "VisionEventMatch_gameEventId_idx" ON "VisionEventMatch"("gameEventId");

-- CreateIndex
CREATE INDEX "VisionEventMatch_observationId_idx" ON "VisionEventMatch"("observationId");

-- CreateIndex
CREATE INDEX "VisionEventMatch_reviewStatus_idx" ON "VisionEventMatch"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VisionEventMatch_observationId_gameEventId_key" ON "VisionEventMatch"("observationId", "gameEventId");

-- CreateIndex
CREATE INDEX "VisionSpatialSummary_gameVideoId_idx" ON "VisionSpatialSummary"("gameVideoId");

-- CreateIndex
CREATE INDEX "VisionSpatialSummary_playerId_idx" ON "VisionSpatialSummary"("playerId");

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTimelineAnchor" ADD CONSTRAINT "VideoTimelineAnchor_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTimelineAnchor" ADD CONSTRAINT "VideoTimelineAnchor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCalibration" ADD CONSTRAINT "CourtCalibration_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCalibration" ADD CONSTRAINT "CourtCalibration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysisRun" ADD CONSTRAINT "VisionAnalysisRun_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysisRun" ADD CONSTRAINT "VisionAnalysisRun_visionModelId_fkey" FOREIGN KEY ("visionModelId") REFERENCES "VisionModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysisRun" ADD CONSTRAINT "VisionAnalysisRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrack" ADD CONSTRAINT "VisionTrack_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrack" ADD CONSTRAINT "VisionTrack_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "VisionAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrack" ADD CONSTRAINT "VisionTrack_playerCandidatePlayerId_fkey" FOREIGN KEY ("playerCandidatePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionObservation" ADD CONSTRAINT "VisionObservation_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "VisionAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionObservation" ADD CONSTRAINT "VisionObservation_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionObservation" ADD CONSTRAINT "VisionObservation_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "VisionTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionObservation" ADD CONSTRAINT "VisionObservation_playerCandidatePlayerId_fkey" FOREIGN KEY ("playerCandidatePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionEventMatch" ADD CONSTRAINT "VisionEventMatch_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "VisionObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionEventMatch" ADD CONSTRAINT "VisionEventMatch_gameEventId_fkey" FOREIGN KEY ("gameEventId") REFERENCES "GameEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionSpatialSummary" ADD CONSTRAINT "VisionSpatialSummary_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionSpatialSummary" ADD CONSTRAINT "VisionSpatialSummary_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "VisionAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionSpatialSummary" ADD CONSTRAINT "VisionSpatialSummary_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
