-- Phase 9 Track C: real club onboarding readiness and coach selection workflow.

CREATE TYPE "ClubBrandingStatus" AS ENUM ('IDENTITY_READY', 'BRANDING_INCOMPLETE', 'READY');
CREATE TYPE "CoachSeasonZeroSelectionStatus" AS ENUM ('PENDING', 'SEASON_ZERO_SELECTED', 'NOT_SELECTED');

ALTER TABLE "Club"
  ADD COLUMN "brandingStatus" "ClubBrandingStatus" NOT NULL DEFAULT 'BRANDING_INCOMPLETE',
  ADD COLUMN "motto" TEXT,
  ADD COLUMN "publicBio" TEXT;

ALTER TABLE "Application"
  ADD COLUMN "coachSeasonZeroSelectionStatus" "CoachSeasonZeroSelectionStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "Club_brandingStatus_idx" ON "Club"("brandingStatus");
CREATE INDEX "Application_type_status_coachSeasonZeroSelectionStatus_idx"
  ON "Application"("type", "status", "coachSeasonZeroSelectionStatus");
