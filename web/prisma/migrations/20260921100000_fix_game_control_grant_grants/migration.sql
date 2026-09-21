-- Fix /access (game-control grants dashboard): GameControlGrant was created with RLS +
-- policy but never granted table privileges to the restricted app roles, so every read
-- failed with `permission denied for table GameControlGrant`.
--
-- Mirrors the Stage 5.5A restricted-role grant block used by every other tenant table.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "GameControlGrant" TO ultraos_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "GameControlGrant" TO ultraos_staging;
  END IF;
END $$;