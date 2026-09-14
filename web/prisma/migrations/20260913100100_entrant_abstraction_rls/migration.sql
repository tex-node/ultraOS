-- Multi-sport Stage 2 (S2.1): row-level security and restricted-role grants for the two new
-- tenant-owned Entrant tables.
--
-- Hand-authored. RLS policies have no representation in Prisma's schema language, so this is
-- deliberately separate from the DDL migration (20260913100000_entrant_abstraction). Mirrors the
-- exact Stage 4a tenant_isolation pattern and the Stage 5.5A restricted-role grant block.
--
-- Deliberately NOT changed here: the existing Neon Ultra RLS fallback expression, the tenant-table
-- organizationId database defaults, and the intentionally-global Sport table.
--
-- NOT APPLIED anywhere by this commit.

-- Entrant
ALTER TABLE "Entrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Entrant" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- EntrantMember
ALTER TABLE "EntrantMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EntrantMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EntrantMember" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent; mirrors Stage 5.5A).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Entrant" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "EntrantMember" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Entrant" TO ultraos_staging;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "EntrantMember" TO ultraos_staging;
  END IF;
END $$;
