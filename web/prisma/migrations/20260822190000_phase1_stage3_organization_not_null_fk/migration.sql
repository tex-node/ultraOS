-- Phase 1, Stage 3: Multi-Tenancy Foundation - organizationId NOT NULL + FK + default
--
-- Generated via the same live read-only `prisma migrate diff --from-config-datasource
-- --to-schema <candidate>` method used for every prior migration in this project. The raw diff
-- output also contained the same 5 cosmetic RenameIndex statements seen in every prior
-- migration - excluded here as always.
--
-- 104 tables: organizationId becomes NOT NULL, gets a foreign key to Organization(id), and gets
-- a database-level default of 'cmt4odhgn0000wokk8fbwr6ro' (Neon Ultra Basketball League, created
-- in Stage 2). Safe with zero data risk: Stage 2's backfill already verified zero remaining NULL
-- rows across every one of these tables, and every existing value is already this exact
-- organization's id, so NOT NULL and the FK cannot fail against current data.
--
-- The DB-level default is a deliberate, disclosed bridge, not a permanent design choice: making
-- the column required in Prisma's generated types (without a default) would have required
-- threading real session-derived organization context through every create call site across the
-- app first (799 compile errors surfaced when this was tried) - that is Stage 5's job, not
-- Stage 3's. The default lets every existing, not-yet-org-aware code path keep compiling and
-- working unchanged while the constraint itself becomes real and enforced at the database level.
-- This default MUST be removed (see schema.prisma's Organization doc comment) before a second
-- real organization is ever onboarded - until then, any code that forgets to pass organizationId
-- explicitly would silently (not loudly) attribute new data to Neon Ultra, which is correct only
-- because Neon Ultra is still the only tenant that exists.

-- AlterTable
ALTER TABLE "Accreditation" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AdminOfflineIntake" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Announcement" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Application" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Athlete" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AthleteAward" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AthleteMedia" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AthleteTrainingMetric" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AthleteTrainingRecord" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AthleteVideo" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "CheckIn" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Club" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Competition" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ContentAsset" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ContentJob" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ContentTemplate" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "CourtCalibration" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "CourtSpecification" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DisplayHeartbeat" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Division" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Draft" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftAllocation" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftCoachPoolEntry" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftEvent" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftPick" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftSquad" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "DraftSquadMember" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Equipment" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "EventDebrief" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "EventStaffAssignment" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "EventVendorReview" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "EventVolunteerReview" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "FanClub" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "FanMembership" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Fixture" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "FixtureOfficial" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "GameEvent" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "GamePeriodScore" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "GameRuleSnapshot" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "GameStarter" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "GameVideo" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ImportJob" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ImportRow" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Incident" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "LaunchReadinessCheck" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "MVPVote" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "MediaAsset" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "MediaAssetUsage" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "MediaAssetVariant" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "MediaProfile" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "NoveltyGame" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "NoveltyGameEvent" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "NoveltyMatch" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "NoveltyPlayerStat" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "NoveltyTeam" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OperationalChecklist" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OperationalChecklistItem" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OperatorMessage" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OpsDocument" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OpsNotification" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OpsTask" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ParticipantDocument" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "PlayerStat" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "PromoCode" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "PublicIdAlias" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "PublicIdCounter" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Rehearsal" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "RuleSet" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Runbook" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "RunbookTask" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "ScoutReport" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Season" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "SeasonClub" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "SeatReservation" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "SeatZone" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "SponsorCampaign" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Staff" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Standing" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "SystemSetting" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "TeamStat" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "TrainingSession" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VendorInventory" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VendorProduct" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "Venue" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VenueSection" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VenueZone" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VideoTimelineAnchor" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionAnalysisRun" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionEventMatch" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionModel" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionObservation" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionSpatialSummary" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionTrack" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VisionTrajectoryArtifact" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "VolunteerProfile" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AlterTable
ALTER TABLE "WellWish" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT 'cmt4odhgn0000wokk8fbwr6ro';

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteAward" ADD CONSTRAINT "AthleteAward_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteVideo" ADD CONSTRAINT "AthleteVideo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTrainingRecord" ADD CONSTRAINT "AthleteTrainingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteTrainingMetric" ADD CONSTRAINT "AthleteTrainingMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteMedia" ADD CONSTRAINT "AthleteMedia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetVariant" ADD CONSTRAINT "MediaAssetVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAssetUsage" ADD CONSTRAINT "MediaAssetUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantDocument" ADD CONSTRAINT "ParticipantDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftEvent" ADD CONSTRAINT "DraftEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSquad" ADD CONSTRAINT "DraftSquad_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSquadMember" ADD CONSTRAINT "DraftSquadMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftCoachPoolEntry" ADD CONSTRAINT "DraftCoachPoolEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftAllocation" ADD CONSTRAINT "DraftAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalChecklist" ADD CONSTRAINT "OperationalChecklist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalChecklistItem" ADD CONSTRAINT "OperationalChecklistItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Runbook" ADD CONSTRAINT "Runbook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunbookTask" ADD CONSTRAINT "RunbookTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorMessage" ADD CONSTRAINT "OperatorMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayHeartbeat" ADD CONSTRAINT "DisplayHeartbeat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rehearsal" ADD CONSTRAINT "Rehearsal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueZone" ADD CONSTRAINT "VenueZone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchReadinessCheck" ADD CONSTRAINT "LaunchReadinessCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsTask" ADD CONSTRAINT "OpsTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsNotification" ADD CONSTRAINT "OpsNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsDocument" ADD CONSTRAINT "OpsDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDebrief" ADD CONSTRAINT "EventDebrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendorReview" ADD CONSTRAINT "EventVendorReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVolunteerReview" ADD CONSTRAINT "EventVolunteerReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellWish" ADD CONSTRAINT "WellWish_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueSection" ADD CONSTRAINT "VenueSection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatZone" ADD CONSTRAINT "SeatZone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOfflineIntake" ADD CONSTRAINT "AdminOfflineIntake_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicIdCounter" ADD CONSTRAINT "PublicIdCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicIdAlias" ADD CONSTRAINT "PublicIdAlias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaProfile" ADD CONSTRAINT "MediaProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProduct" ADD CONSTRAINT "VendorProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInventory" ADD CONSTRAINT "VendorInventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorCampaign" ADD CONSTRAINT "SponsorCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureOfficial" ADD CONSTRAINT "FixtureOfficial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRuleSnapshot" ADD CONSTRAINT "GameRuleSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePeriodScore" ADD CONSTRAINT "GamePeriodScore_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameStarter" ADD CONSTRAINT "GameStarter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStat" ADD CONSTRAINT "TeamStat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoveltyTeam" ADD CONSTRAINT "NoveltyTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoveltyGame" ADD CONSTRAINT "NoveltyGame_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoveltyGameEvent" ADD CONSTRAINT "NoveltyGameEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoveltyPlayerStat" ADD CONSTRAINT "NoveltyPlayerStat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanClub" ADD CONSTRAINT "FanClub_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanMembership" ADD CONSTRAINT "FanMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutReport" ADD CONSTRAINT "ScoutReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MVPVote" ADD CONSTRAINT "MVPVote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJob" ADD CONSTRAINT "ContentJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTimelineAnchor" ADD CONSTRAINT "VideoTimelineAnchor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtCalibration" ADD CONSTRAINT "CourtCalibration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionModel" ADD CONSTRAINT "VisionModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionAnalysisRun" ADD CONSTRAINT "VisionAnalysisRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrack" ADD CONSTRAINT "VisionTrack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionObservation" ADD CONSTRAINT "VisionObservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionEventMatch" ADD CONSTRAINT "VisionEventMatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionSpatialSummary" ADD CONSTRAINT "VisionSpatialSummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSpecification" ADD CONSTRAINT "CourtSpecification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTrajectoryArtifact" ADD CONSTRAINT "VisionTrajectoryArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
