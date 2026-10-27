-- Streak v18, Prompt 2: a SYSTEM actor for audit rows written without a human.
--
-- AuditLog.userId is a foreign key to User, which is why a webhook-driven plan change could not be audited in v17. The
-- fix keeps the FK and makes the actor real: one row per database representing the platform itself. Queries that join
-- User still work, and a system change is visibly a system change rather than a synthetic string that would fail the
-- constraint.
--
-- The id is fixed (not a cuid) so the application constant, this migration and any test agree.
INSERT INTO "User" ("id", "name", "email", "emailVerified", "passwordHash", "isActive", "role", "createdAt", "updatedAt")
VALUES ('system00000000000000000', 'System', 'system@ultraleagueos.local', now(), NULL, false, 'SUPER_ADMIN', now(), now())
ON CONFLICT ("id") DO NOTHING;

-- It must never be able to sign in: no password hash, inactive, and an address nobody owns. Assert the invariants the
-- insert already states, so a later accidental edit is caught by the database rather than by an incident.
ALTER TABLE "User" ADD CONSTRAINT "User_system_actor_guard"
  CHECK ("id" <> 'system00000000000000000' OR ("passwordHash" IS NULL AND "isActive" = false))
  NOT VALID;

COMMENT ON TABLE "AuditLog" IS 'Who did what. userId "system00000000000000000" is the platform itself (webhooks, jobs).';
