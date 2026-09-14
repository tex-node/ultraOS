-- Multi-sport Stage 1 (S1.3): row-level security and restricted-role grants for
-- SportDefinitionOverride.
--
-- Hand-authored. RLS policies have no representation in Prisma's schema language, so this is
-- deliberately separate from the DDL migration (20260913090000_sport_definition_override).
-- Mirrors the exact Stage 4a tenant_isolation pattern and the Stage 5.5A restricted-role grant
-- block, and matches the most recent tenant table (20260912120100_event_registration_v1_rls).
--
-- Deliberately NOT changed here: the existing Neon Ultra RLS fallback expression, the
-- tenant-table organizationId database defaults, and the intentionally-global Sport table
-- (which has no organizationId and therefore no policy).
--
-- NOT APPLIED anywhere by this commit.

-- SportDefinitionOverride
ALTER TABLE "SportDefinitionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SportDefinitionOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SportDefinitionOverride" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent; mirrors Stage 5.5A).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SportDefinitionOverride" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "SportDefinitionOverride" TO ultraos_staging;
  END IF;
END $$;
