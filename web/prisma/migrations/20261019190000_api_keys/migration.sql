-- Streak v9, Prompt 2: developer API keys.
--
-- 5-step tenant checklist:
--   1. tenant column (organizationId)          2. composite unique (organizationId, id)
--   3. RLS enabled AND forced                  4. tenant_isolation policy on the app's own session variable
--   5. runtime-role GRANTs in this same file, for all three roles
--
-- The one genuinely new piece is the lookup. Authentication has to find a key BEFORE the organization is
-- known, so a plain RLS policy cannot serve it (the policy compares against app.current_org_id, which is not
-- set yet). Rather than weaken the policy, the lookup is a SECURITY DEFINER function that returns only three
-- non-secret columns and is executable by the runtime roles. The table itself stays fully tenant-isolated for
-- every normal read and write.

-- 1-2. enums, table, keys
CREATE TYPE "ApiKeyTier" AS ENUM ('BASIC', 'PRO', 'ENTERPRISE');

CREATE TABLE "ApiKey" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "name"           TEXT NOT NULL,
  "keyHash"        TEXT NOT NULL,
  "prefix"         TEXT NOT NULL,
  "tier"           "ApiKeyTier" NOT NULL DEFAULT 'BASIC',
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt"     TIMESTAMP(3),
  "createdById"    TEXT NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE UNIQUE INDEX "ApiKey_organizationId_id_key" ON "ApiKey"("organizationId", "id");
CREATE INDEX "ApiKey_organizationId_isActive_idx" ON "ApiKey"("organizationId", "isActive");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3-4. Row-level security, forced, with the canonical policy shape (same as CoachingPlan).
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ApiKey"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));

-- The authentication lookup. SECURITY DEFINER runs with the OWNER's rights (the migration role, which bypasses
-- RLS), which is exactly what a pre-tenant lookup needs. It returns no secret material - the hash it is given is
-- already the caller's own hash - and it cannot enumerate keys: an unknown hash returns nothing.
CREATE OR REPLACE FUNCTION resolve_api_key(candidate_hash TEXT)
RETURNS TABLE (id TEXT, organization_id TEXT, tier "ApiKeyTier")
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k."id", k."organizationId", k."tier"
  FROM "ApiKey" k
  WHERE k."keyHash" = candidate_hash
    AND k."isActive" = true
    AND k."revokedAt" IS NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION resolve_api_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_api_key(TEXT) TO ultraos;
GRANT EXECUTE ON FUNCTION resolve_api_key(TEXT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION resolve_api_key(TEXT) TO ultraos_staging;

-- 5. Runtime-role GRANTs for the table itself.
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKey" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKey" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKey" TO ultraos_staging;
