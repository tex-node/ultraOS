-- Event Registration v2 (R2): RLS and restricted-role grants for the new
-- tenant-owned sport-membership table.
--
-- Hand-authored. RLS has no Prisma representation, so it is separate from the
-- DDL migration 20260912130000_team_competition_sport_rosters. Mirrors the exact
-- Stage 4a tenant_isolation pattern and the Stage 5.5A idempotent grant block.
--
-- Deliberately unchanged: the existing Neon Ultra RLS fallback expression, the
-- tenant-table organizationId defaults, the R1 registration policies/grants, and
-- the intentionally-global locator tables.
--
-- NOT APPLIED anywhere by this commit.

-- RegistrationParticipantSport
ALTER TABLE "RegistrationParticipantSport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationParticipantSport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationParticipantSport" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationParticipantSport" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RegistrationParticipantSport" TO ultraos_staging;
  END IF;
END $$;
