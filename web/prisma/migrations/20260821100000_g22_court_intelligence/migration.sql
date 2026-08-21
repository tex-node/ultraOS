-- G.22: Empirical AI Vision Validation & Ultra Court Intelligence
--
-- Generated via a live read-only `prisma migrate diff --from-config-datasource --to-schema
-- <candidate>` against production (see documentation/vision/ULTRA_COURT_SPECIFICATION.md and the
-- G.22 final report for the full methodology). The raw diff output also contained two orphaned
-- DROP INDEX statements and five cosmetic RenameIndex statements that are pre-existing,
-- classified drift unrelated to G.22 - those are handled by (respectively) the separate
-- 20260821090000_reconcile_orphaned_indexes migration and left deliberately untouched. Neither is
-- included here, per the project's own rule against mixing unrelated changes into one migration.
--
-- Purely additive: new enums, new nullable/defaulted columns on existing tables, two new tables.
-- No column is dropped, no existing column's type or nullability changes, no existing row's data
-- is touched.

-- CreateEnum
CREATE TYPE "CourtSpecificationStatus" AS ENUM ('DRAFT', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "CourtBasketSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "VideoIngestStatus" AS ENUM ('REGISTERED', 'PROBING', 'PROBE_FAILED', 'PROXY_GENERATING', 'PROXY_FAILED', 'READY_FOR_ALIGNMENT', 'READY_FOR_ANALYSIS');

-- CreateEnum
CREATE TYPE "VisionFailureCategory" AS ENUM ('FALSE_POSITIVE', 'FALSE_NEGATIVE', 'ID_SWITCH', 'BAD_CALIBRATION', 'JERSEY_ERROR', 'TIMELINE_ERROR', 'OCCLUSION', 'AMBIGUOUS');

-- AlterTable
ALTER TABLE "CourtCalibration" ADD COLUMN     "qualityBand" TEXT,
ADD COLUMN     "reprojectionErrorUnits" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "homeAttacksBasketFirstHalf" "CourtBasketSide";

-- AlterTable
ALTER TABLE "GameVideo" ADD COLUMN     "codec" TEXT,
ADD COLUMN     "container" TEXT,
ADD COLUMN     "hasAudio" BOOLEAN,
ADD COLUMN     "ingestStatus" "VideoIngestStatus" NOT NULL DEFAULT 'REGISTERED',
ADD COLUMN     "probeError" TEXT,
ADD COLUMN     "probedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VisionEventMatch" ADD COLUMN     "failureCategory" "VisionFailureCategory";

-- AlterTable
ALTER TABLE "VisionObservation" ADD COLUMN     "failureCategory" "VisionFailureCategory";

-- CreateTable
CREATE TABLE "CourtSpecification" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CourtSpecificationStatus" NOT NULL DEFAULT 'DRAFT',
    "courtLengthUnits" DOUBLE PRECISION,
    "courtWidthUnits" DOUBLE PRECISION,
    "units" TEXT NOT NULL DEFAULT 'meters',
    "originDescription" TEXT,
    "basketACourtX" DOUBLE PRECISION,
    "basketACourtY" DOUBLE PRECISION,
    "basketBCourtX" DOUBLE PRECISION,
    "basketBCourtY" DOUBLE PRECISION,
    "halfCourtX" DOUBLE PRECISION,
    "paintGeometry" JSONB,
    "threePointGeometry" JSONB,
    "fourPointGeometry" JSONB,
    "effectiveSeasonId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionTrajectoryArtifact" (
    "id" TEXT NOT NULL,
    "gameVideoId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "storageProvider" "MediaStorageProvider" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'jsonl',
    "checksumSha256" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "timeRangeStartMs" INTEGER NOT NULL,
    "timeRangeEndMs" INTEGER NOT NULL,
    "trackRefs" JSONB,
    "filtered" BOOLEAN NOT NULL DEFAULT false,
    "filterMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionTrajectoryArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourtSpecification_venueId_status_idx" ON "CourtSpecification"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSpecification_venueId_version_key" ON "CourtSpecification"("venueId", "version");

-- CreateIndex
CREATE INDEX "VisionTrajectoryArtifact_gameVideoId_idx" ON "VisionTrajectoryArtifact"("gameVideoId");

-- CreateIndex
CREATE INDEX "VisionTrajectoryArtifact_analysisRunId_idx" ON "VisionTrajectoryArtifact"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "VisionTrajectoryArtifact_storageProvider_objectKey_key" ON "VisionTrajectoryArtifact"("storageProvider", "objectKey");

-- AddForeignKey
ALTER TABLE "CourtSpecification" ADD CONSTRAINT "CourtSpecification_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSpecification" ADD CONSTRAINT "CourtSpecification_effectiveSeasonId_fkey" FOREIGN KEY ("effectiveSeasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSpecification" ADD CONSTRAINT "CourtSpecification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrajectoryArtifact" ADD CONSTRAINT "VisionTrajectoryArtifact_gameVideoId_fkey" FOREIGN KEY ("gameVideoId") REFERENCES "GameVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrajectoryArtifact" ADD CONSTRAINT "VisionTrajectoryArtifact_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "VisionAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
