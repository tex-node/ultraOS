-- Phase 1, Stage 4a: Multi-Tenancy Foundation - Row-Level Security enforcement layer
--
-- Hand-authored, not generated via `prisma migrate diff` - RLS policies are a database-only
-- concept with no representation in Prisma's schema language, so schema.prisma is unchanged by
-- this migration.
--
-- IMPORTANT: this migration has NO EFFECT on the currently running application. The production
-- app connects as the "ultraos" Postgres role, which is a superuser with rolbypassrls=true -
-- Postgres never applies row security to superusers or BYPASSRLS roles, by design (see the
-- Postgres docs on CREATE POLICY). Enabling RLS here is a deliberate, safe no-op today; real
-- enforcement requires a separate, later step (Stage 4b) that creates a restricted, non-superuser
-- role for the app to connect as instead - a materially higher-risk change (it touches the live
-- app's DB credentials) that is intentionally kept out of this migration.
--
-- Policy design: every tenant table gets `organizationId = COALESCE(NULLIF(current_setting(
-- 'app.current_org_id', true), ''), '<neon-ultra-org-id>')`, applied to both USING (read/update/
-- delete visibility) and WITH CHECK (insert/update validity). The fallback to Neon Ultra's own
-- organization id (matching the same value already used as the Stage 3a column default) means
-- that once Stage 4b's restricted role exists, the app continues to behave EXACTLY as it does
-- today even before Stage 5 threads real session-derived org context through every request -
-- nothing breaks in between. A future request that correctly sets app.current_org_id to a
-- different real organization gets properly isolated; a request that fails to set it at all
-- safely defaults to Neon Ultra, never to "everything" or to a wrong tenant.
--
-- Rehearsed end-to-end before this migration was written, against a fresh restore of production
-- into the ultraos_staging database, connecting as the real non-superuser ultraos_staging role
-- (which has rolbypassrls=false): confirmed (1) no session variable set -> falls back to Neon
-- Ultra's data, identical to today's behavior, (2) session variable set to a nonexistent org ->
-- zero rows visible, (3) a genuine second Organization row created for the test -> its own
-- session correctly sees only its own data, Neon Ultra's session sees none of it, and (4) an
-- INSERT attempting to claim a different organization than the active session is rejected with
-- "new row violates row-level security policy". Test data cleaned up afterward; production is
-- untouched by any of this until the statements below run against it.

ALTER TABLE "Competition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Competition" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Competition" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Division" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Division" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Division" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Season" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Season" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Club" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Club" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Club" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "SeasonClub" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeasonClub" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SeasonClub" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Athlete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Athlete" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Athlete" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Player" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Player" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AthleteAward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteAward" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AthleteAward" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AthleteVideo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteVideo" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AthleteVideo" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "TrainingSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TrainingSession" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AthleteTrainingRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteTrainingRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AthleteTrainingRecord" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AthleteTrainingMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteTrainingMetric" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AthleteTrainingMetric" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AthleteMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteMedia" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AthleteMedia" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaAsset" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "MediaAssetVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAssetVariant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaAssetVariant" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "MediaAssetUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAssetUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaAssetUsage" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ParticipantDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParticipantDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ParticipantDocument" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Staff" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Draft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Draft" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Draft" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftPick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftPick" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftPick" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftEvent" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftSquad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftSquad" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftSquad" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftSquadMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftSquadMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftSquadMember" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftCoachPoolEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftCoachPoolEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftCoachPoolEntry" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DraftAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DraftAllocation" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OperationalChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperationalChecklist" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OperationalChecklist" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OperationalChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperationalChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OperationalChecklistItem" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Incident" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Incident" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Runbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Runbook" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Runbook" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "RunbookTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RunbookTask" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RunbookTask" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OperatorMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperatorMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OperatorMessage" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "DisplayHeartbeat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisplayHeartbeat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DisplayHeartbeat" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Rehearsal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rehearsal" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rehearsal" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Equipment" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "EventStaffAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventStaffAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EventStaffAssignment" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VenueZone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VenueZone" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VenueZone" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "SystemSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SystemSetting" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "LaunchReadinessCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LaunchReadinessCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LaunchReadinessCheck" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OpsTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpsTask" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OpsTask" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OpsNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpsNotification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OpsNotification" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OpsDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpsDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OpsDocument" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Venue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Venue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Venue" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Event" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "EventDebrief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventDebrief" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EventDebrief" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "EventVendorReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventVendorReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EventVendorReview" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "EventVolunteerReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventVolunteerReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EventVolunteerReview" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Announcement" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "WellWish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WellWish" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WellWish" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VenueSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VenueSection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VenueSection" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "SeatZone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeatZone" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SeatZone" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "SeatReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeatReservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SeatReservation" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Ticket" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Accreditation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Accreditation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Accreditation" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Application" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AdminOfflineIntake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminOfflineIntake" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdminOfflineIntake" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "PublicIdCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicIdCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PublicIdCounter" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "PublicIdAlias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicIdAlias" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PublicIdAlias" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ImportJob" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportRow" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ImportRow" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Vendor" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "MediaProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MediaProfile" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VolunteerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VolunteerProfile" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VendorProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorProduct" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VendorProduct" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VendorInventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorInventory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VendorInventory" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderItem" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "CheckIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckIn" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CheckIn" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "PromoCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromoCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromoCode" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "SponsorCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SponsorCampaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SponsorCampaign" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Fixture" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fixture" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Fixture" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "FixtureOfficial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FixtureOfficial" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FixtureOfficial" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Game" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Game" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "RuleSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleSet" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RuleSet" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "GameRuleSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameRuleSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameRuleSnapshot" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "GamePeriodScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamePeriodScore" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GamePeriodScore" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "GameEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameEvent" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "GameStarter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameStarter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameStarter" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "PlayerStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlayerStat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlayerStat" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "TeamStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamStat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeamStat" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "Standing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Standing" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Standing" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "NoveltyTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoveltyTeam" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NoveltyTeam" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "NoveltyMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoveltyMatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NoveltyMatch" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "NoveltyGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoveltyGame" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NoveltyGame" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "NoveltyGameEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoveltyGameEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NoveltyGameEvent" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "NoveltyPlayerStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoveltyPlayerStat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NoveltyPlayerStat" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "FanClub" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FanClub" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FanClub" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "FanMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FanMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FanMembership" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ScoutReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScoutReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScoutReport" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "MVPVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MVPVote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MVPVote" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ContentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContentTemplate" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ContentJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContentJob" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ContentAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ContentAsset" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "GameVideo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameVideo" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameVideo" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VideoTimelineAnchor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoTimelineAnchor" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VideoTimelineAnchor" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "CourtCalibration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourtCalibration" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CourtCalibration" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionModel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionModel" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionAnalysisRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionAnalysisRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionAnalysisRun" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionTrack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionTrack" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionTrack" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionObservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionObservation" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionEventMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionEventMatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionEventMatch" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionSpatialSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionSpatialSummary" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionSpatialSummary" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "CourtSpecification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourtSpecification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CourtSpecification" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "VisionTrajectoryArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VisionTrajectoryArtifact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VisionTrajectoryArtifact" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

