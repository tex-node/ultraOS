-- Event Registration v1 (R1): row-level security and restricted-role grants for
-- the four new tenant-owned registration tables.
--
-- Hand-authored. RLS policies have no representation in Prisma's schema
-- language, so this is deliberately separate from the DDL migration
-- (20260912120000_event_registration_v1_foundation). Mirrors the exact Stage 4a
-- tenant_isolation pattern and the Stage 5.5A restricted-role grant block.
--
-- Deliberately NOT changed here: the existing Neon Ultra RLS fallback
-- expression, the tenant-table organizationId database defaults, and the
-- intentionally-global PublicResourceLocator/PublicTokenLocator tables.
--
-- NOT APPLIED anywhere by this commit.

-- RegistrationForm
ALTER TABLE "RegistrationForm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationForm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationForm" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- RegistrationField
ALTER TABLE "RegistrationField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationField" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationField" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- RegistrationSubmission
ALTER TABLE "RegistrationSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationSubmission" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- RegistrationParticipant
ALTER TABLE "RegistrationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationParticipant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationParticipant" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent; mirrors Stage 5.5A).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationForm" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationField" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationSubmission" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationParticipant" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationForm" TO ultraos_staging;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationField" TO ultraos_staging;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationSubmission" TO ultraos_staging;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationParticipant" TO ultraos_staging;
  END IF;
END $$;
