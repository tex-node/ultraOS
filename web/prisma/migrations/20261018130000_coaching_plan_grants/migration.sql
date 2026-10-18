-- Runtime-role grants for CoachingPlan.
--
-- Same omission GameControlGrant had (fixed afterwards in 20260921100000_fix_game_control_grant_grants):
-- there are no ALTER DEFAULT PRIVILEGES in this database, so every new table must be granted
-- explicitly. Without this, the table is readable only by the privileged migration role and every
-- coaching player page fails with:
--   DriverAdapterError: permission denied for table CoachingPlan (SQLSTATE 42501)
--
-- Found by rendering the deployed page against staging with a real session - the DB tests could not
-- catch it because createTestDbContext provisions a schema as the same role that then queries it.
-- RLS still applies to both granted roles: the grant is table access, the tenant_isolation policy is
-- row access, and they are independent layers.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CoachingPlan" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CoachingPlan" TO ultraos_staging;
