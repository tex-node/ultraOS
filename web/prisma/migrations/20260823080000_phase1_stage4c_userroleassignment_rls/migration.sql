-- Phase 1, Stage 4c: close a gap left by Stage 4a's RLS rollout.
--
-- "UserRoleAssignment" got its organizationId column in Stage 0, before the "104 tenant tables"
-- enumeration existed, and every later stage's table list treated it as "already handled
-- separately" - it never actually was. Discovered empirically during Stage 5.2B-1's cross-tenant
-- rehearsal: creating a UserRoleAssignment stamped for a different organization than the active
-- session context was NOT rejected, unlike the equivalent Athlete/Staff creates, because this
-- table had zero RLS policies (relrowsecurity = false, confirmed via pg_class on ultraos_staging).
--
-- Unlike the 104 tables from Stage 4a, organizationId here is NULLABLE - a null value represents
-- a platform-level role grant not scoped to any single organization (see upsertRoleAssignment in
-- src/lib/user-roles.ts, which passes organizationId as optional). The policy below therefore
-- allows a row through whenever organizationId IS NULL, in addition to the same
-- COALESCE(...)-to-Neon-Ultra pattern used everywhere else for non-null rows. This keeps
-- platform-level grants globally visible/manageable while still rejecting any attempt to
-- create or read a row whose non-null organizationId doesn't match the active session context.
--
-- Same superuser/BYPASSRLS caveat as Stage 4a: this has no effect on the app today because it
-- still connects as a role with rolbypassrls=true until credentials are rotated for this table's
-- callers - the production app already runs as the restricted "ultraos_app" role from Stage 4b,
-- so this migration takes effect immediately once deployed, not as a later no-op.
--
-- Rehearsed against ultraos_staging: re-ran the same cross-org UserRoleAssignment create that
-- previously succeeded unexpectedly (FAIL) and confirmed it is now denied (PASS), while a
-- same-org create and a null-organizationId create both continue to succeed.

ALTER TABLE "UserRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRoleAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRoleAssignment" FOR ALL
  USING ("organizationId" IS NULL OR "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'))
  WITH CHECK ("organizationId" IS NULL OR "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));
