-- Streak v6, Prompt 1 fix: the feed policies read the WRONG session variable.
--
-- 20261018200000 wrote `current_setting('app.current_organization_id', true)`, but the application sets
-- `app.current_org_id` (see withOrganizationContext, "the one place app.current_org_id ever gets set"), and
-- every other tenant table's policy reads that name with a COALESCE fallback to Neon Ultra:
--
--   "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), '<neon-ultra>')
--
-- With the wrong name the setting is always unset under the app role, so the predicate was NULL: SELECT
-- returned zero rows and INSERT would have failed the WITH CHECK. Nothing caught it because every
-- verification script connects with the PRIVILEGED url (BYPASSRLS) and the earlier RLS probe set the same
-- wrong variable it was testing. The symptom that surfaced it: the cron drain reported
-- {"organizations":0} while a PENDING delivery existed.
--
-- These policies are now byte-for-byte the same shape as CoachingPlan/ScoresheetImport, so there is one
-- tenancy rule in the database and not two. Stricter is not better here: the fallback is the documented
-- temporary bridge that public, unscoped routes depend on.
DROP POLICY IF EXISTS "tenant_isolation" ON "DataFeedSubscription";
CREATE POLICY "tenant_isolation" ON "DataFeedSubscription"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));

DROP POLICY IF EXISTS "tenant_isolation" ON "DataFeedDelivery";
CREATE POLICY "tenant_isolation" ON "DataFeedDelivery"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));
