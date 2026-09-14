-- Multi-sport Stage 3 (S3.1): row-level security and restricted-role grants for GameMetricValue.
--
-- Hand-authored. RLS policies have no representation in Prisma's schema language, so this is
-- deliberately separate from the DDL migration (20260913110000_generic_statistics). Mirrors the
-- exact Stage 4a tenant_isolation pattern and the Stage 5.5A restricted-role grant block.
--
-- SportMetricDefinition is deliberately NOT included: it is a global, registry-derived catalog
-- with no organizationId, exactly like Sport.
--
-- NOT APPLIED anywhere by this commit.

-- GameMetricValue
ALTER TABLE "GameMetricValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameMetricValue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameMetricValue" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent; mirrors Stage 5.5A).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "GameMetricValue" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "GameMetricValue" TO ultraos_staging;
  END IF;
END $$;
