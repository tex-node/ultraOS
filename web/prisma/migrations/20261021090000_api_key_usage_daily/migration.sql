-- Streak v13, Prompt 4: per-day request counts, so a partner dashboard can answer "how many calls today?".
--
-- The API key table already says WHEN a key was last used; it cannot say how many requests it made. Counting in the
-- dashboard from logs is not available (there is no request log), so the count is stored as it happens.
--
-- 5-step tenant checklist:
--   1. tenant column (organizationId)           2. composite unique (organizationId, id)
--   3. RLS enabled AND forced                   4. tenant_isolation policy on app.current_org_id
--   5. runtime-role GRANTs in this same file, for all three roles
CREATE TABLE "ApiKeyUsageDaily" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "apiKeyId"       TEXT NOT NULL,
  "day"            DATE NOT NULL,
  "requests"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiKeyUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKeyUsageDaily_organizationId_id_key" ON "ApiKeyUsageDaily"("organizationId", "id");
CREATE UNIQUE INDEX "ApiKeyUsageDaily_apiKeyId_day_key" ON "ApiKeyUsageDaily"("apiKeyId", "day");
CREATE INDEX "ApiKeyUsageDaily_organizationId_day_idx" ON "ApiKeyUsageDaily"("organizationId", "day");

ALTER TABLE "ApiKeyUsageDaily" ADD CONSTRAINT "ApiKeyUsageDaily_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiKeyUsageDaily" ADD CONSTRAINT "ApiKeyUsageDaily_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKeyUsageDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKeyUsageDaily" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ApiKeyUsageDaily"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKeyUsageDaily" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKeyUsageDaily" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKeyUsageDaily" TO ultraos_staging;
