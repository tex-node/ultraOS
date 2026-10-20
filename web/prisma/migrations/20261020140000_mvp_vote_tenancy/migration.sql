-- Streak v12, Prompt 4: fan MVP voting joins the tenant checklist.
--
-- The MVPVote table itself already existed (the original MVP spec created it) but with no tenant isolation: RLS off,
-- no policy, and no runtime GRANTs, which is the state that made "log a vote" hard to do safely. This migration adds
-- the four missing steps without touching the data.
--
-- 5-step tenant checklist:
--   1. tenant column (organizationId)          - already present
--   2. composite unique (organizationId, id)   - added here
--   3. RLS enabled AND forced                  - added here
--   4. tenant_isolation policy on app.current_org_id - added here
--   5. runtime-role GRANTs for all three roles - added here
--
-- The one-vote-per-user-per-game rule is a UNIQUE(userId, gameId) that already existed; it is restated in the comment
-- because it is the rule the feature depends on: the database, not the action, is what makes a double submit fail.

-- 2. the composite unique the tenancy pattern requires (a tenant-scoped id pair, so a foreign key can carry it)
CREATE UNIQUE INDEX IF NOT EXISTS "MVPVote_organizationId_id_key" ON "MVPVote"("organizationId", "id");

-- 3-4. row-level security, forced, with the canonical policy shape
ALTER TABLE "MVPVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MVPVote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "MVPVote";
CREATE POLICY "tenant_isolation" ON "MVPVote"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));

-- 5. runtime-role grants, in the same file, so a fresh environment cannot end up with a table the app cannot use
GRANT SELECT, INSERT, UPDATE, DELETE ON "MVPVote" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MVPVote" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MVPVote" TO ultraos_staging;
