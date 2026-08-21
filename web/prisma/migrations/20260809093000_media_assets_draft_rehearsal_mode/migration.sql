-- Phase 9 Track B: media assets and isolated draft rehearsal mode.

CREATE TYPE "DraftEventOperatingMode" AS ENUM ('REHEARSAL', 'LIVE');
CREATE TYPE "MediaStorageProvider" AS ENUM ('CLOUDFLARE_OBJECT_STORAGE', 'LOCAL_PERSISTENT_STORAGE');
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED');
CREATE TYPE "MediaAssetPurpose" AS ENUM (
  'CLUB_LOGO',
  'CLUB_SECONDARY_LOGO',
  'PLAYER_PROFILE_PHOTO',
  'PLAYER_ACTION_PHOTO',
  'COACH_PROFILE_PHOTO',
  'STAFF_PROFILE_PHOTO',
  'SPONSOR_LOGO',
  'JERSEY_IMAGE',
  'DRAFT_BACKGROUND',
  'DRAFT_VIDEO',
  'DRAFT_AUDIO',
  'CONTENT_ASSET'
);

ALTER TABLE "DraftEvent"
  ADD COLUMN "operatingMode" "DraftEventOperatingMode" NOT NULL DEFAULT 'REHEARSAL';

ALTER TABLE "DraftAllocation"
  ADD COLUMN "operatingMode" "DraftEventOperatingMode" NOT NULL DEFAULT 'REHEARSAL';

ALTER TABLE "Staff"
  ADD COLUMN "photoUrl" TEXT;

DROP INDEX IF EXISTS "DraftAllocation_draftEventId_subjectType_sequence_key";
DROP INDEX IF EXISTS "DraftAllocation_draftEventId_subjectType_draftSquadId_key";
DROP INDEX IF EXISTS "DraftAllocation_draftEventId_subjectType_staffId_key";
DROP INDEX IF EXISTS "DraftAllocation_draftEventId_subjectType_seasonClubId_divisionId_key";

CREATE UNIQUE INDEX "DraftAllocation_draftEventId_operatingMode_subjectType_sequence_key"
  ON "DraftAllocation"("draftEventId", "operatingMode", "subjectType", "sequence");

CREATE UNIQUE INDEX "DraftAllocation_draftEventId_operatingMode_subjectType_draftSquadId_key"
  ON "DraftAllocation"("draftEventId", "operatingMode", "subjectType", "draftSquadId");

CREATE UNIQUE INDEX "DraftAllocation_draftEventId_operatingMode_subjectType_staffId_key"
  ON "DraftAllocation"("draftEventId", "operatingMode", "subjectType", "staffId");

CREATE UNIQUE INDEX "DraftAllocation_draftEventId_operatingMode_subjectType_seasonClubId_divisionId_key"
  ON "DraftAllocation"("draftEventId", "operatingMode", "subjectType", "seasonClubId", "divisionId");

CREATE INDEX "DraftAllocation_draftEventId_operatingMode_idx"
  ON "DraftAllocation"("draftEventId", "operatingMode");

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "originalFilename" TEXT,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksumSha256" TEXT NOT NULL,
  "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'UPLOADED',
  "purpose" "MediaAssetPurpose" NOT NULL,
  "title" TEXT,
  "altText" TEXT,
  "caption" TEXT,
  "source" TEXT,
  "capturedAt" TIMESTAMP(3),
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAssetVariant" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "storageProvider" "MediaStorageProvider" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaAssetVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAssetUsage" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "purpose" "MediaAssetPurpose" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaAssetUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storageProvider_objectKey_key"
  ON "MediaAsset"("storageProvider", "objectKey");
CREATE INDEX "MediaAsset_purpose_status_visibility_idx"
  ON "MediaAsset"("purpose", "status", "visibility");
CREATE INDEX "MediaAsset_uploadedById_createdAt_idx"
  ON "MediaAsset"("uploadedById", "createdAt");
CREATE INDEX "MediaAsset_checksumSha256_idx"
  ON "MediaAsset"("checksumSha256");

CREATE UNIQUE INDEX "MediaAssetVariant_assetId_name_key"
  ON "MediaAssetVariant"("assetId", "name");
CREATE UNIQUE INDEX "MediaAssetVariant_storageProvider_objectKey_key"
  ON "MediaAssetVariant"("storageProvider", "objectKey");

CREATE INDEX "MediaAssetUsage_entityType_entityId_active_idx"
  ON "MediaAssetUsage"("entityType", "entityId", "active");
CREATE INDEX "MediaAssetUsage_purpose_isPrimary_active_idx"
  ON "MediaAssetUsage"("purpose", "isPrimary", "active");
CREATE INDEX "MediaAssetUsage_assignedById_assignedAt_idx"
  ON "MediaAssetUsage"("assignedById", "assignedAt");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaAssetVariant"
  ADD CONSTRAINT "MediaAssetVariant_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAssetUsage"
  ADD CONSTRAINT "MediaAssetUsage_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
