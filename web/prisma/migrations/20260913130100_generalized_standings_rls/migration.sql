-- Multi-sport Stage 5 (S5.1): row-level security and restricted-role grants for StandingMetric.
--
-- Hand-authored; separate from the DDL migration (20260913130000_generalized_standings) because RLS
-- has no Prisma schema representation. Mirrors the Stage 4a tenant_isolation pattern and the
-- Stage 5.5A restricted-role grant block. Standing itself already has RLS and is unchanged.
--
-- NOT APPLIED anywhere by this commit.

-- StandingMetric
ALTER TABLE "StandingMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandingMetric" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StandingMetric" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent; mirrors Stage 5.5A).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "StandingMetric" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "StandingMetric" TO ultraos_staging;
  END IF;
END $$;
