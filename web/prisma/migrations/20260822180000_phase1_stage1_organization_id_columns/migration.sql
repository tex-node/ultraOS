-- Phase 1, Stage 1: Multi-Tenancy Foundation - organizationId columns
--
-- Generated via the same live read-only `prisma migrate diff --from-config-datasource
-- --to-schema <candidate>` method used for every prior migration in this project. The raw diff
-- output also contained the same 5 cosmetic RenameIndex statements seen in every prior
-- migration (Prisma-version identifier-truncation artifacts on AthleteTrainingMetric/
-- DraftAllocation indexes, unrelated to this change) - excluded here as always.
--
-- Purely additive: 104 `ADD COLUMN "organizationId" TEXT` statements, one per tenant-scoped
-- table (every model except User, UserRoleAssignment, Sport, TrainingMetricDefinition, and the
-- new Organization table itself - see the Stage 0 migration and schema.prisma's Stage 1 comment
-- on each field). Every column is nullable with no default - every existing row in every table
-- gets organizationId = NULL, no backfill required for this stage, no existing column touched,
-- no constraint added, no index added, no foreign key added. This stage exists purely to make
-- the column present everywhere before Stage 2 (backfill) and Stage 3 (constrain + FK + index)
-- run - deliberately split apart so each stage stays independently small and verifiable, per
-- this project's established migration discipline.

-- AlterTable
ALTER TABLE "Accreditation" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AdminOfflineIntake" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AthleteAward" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AthleteMedia" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AthleteTrainingMetric" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AthleteTrainingRecord" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AthleteVideo" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ContentJob" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ContentTemplate" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CourtCalibration" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CourtSpecification" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DisplayHeartbeat" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftAllocation" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftCoachPoolEntry" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftEvent" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftPick" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftSquad" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DraftSquadMember" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EventDebrief" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EventStaffAssignment" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EventVendorReview" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "EventVolunteerReview" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "FanClub" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "FanMembership" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "FixtureOfficial" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "GamePeriodScore" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "GameRuleSnapshot" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "GameStarter" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "GameVideo" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "LaunchReadinessCheck" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MVPVote" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MediaAssetUsage" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MediaAssetVariant" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "MediaProfile" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NoveltyGame" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NoveltyGameEvent" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NoveltyMatch" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NoveltyPlayerStat" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "NoveltyTeam" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OperationalChecklist" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OperationalChecklistItem" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OperatorMessage" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OpsDocument" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OpsNotification" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OpsTask" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ParticipantDocument" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "PlayerStat" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "PublicIdAlias" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "PublicIdCounter" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Rehearsal" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Runbook" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "RunbookTask" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ScoutReport" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SeasonClub" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SeatReservation" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SeatZone" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SponsorCampaign" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Standing" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SystemSetting" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "TeamStat" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VendorInventory" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VendorProduct" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VenueSection" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VenueZone" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VideoTimelineAnchor" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionAnalysisRun" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionEventMatch" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionModel" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionObservation" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionSpatialSummary" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionTrack" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VisionTrajectoryArtifact" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "VolunteerProfile" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "WellWish" ADD COLUMN     "organizationId" TEXT;

