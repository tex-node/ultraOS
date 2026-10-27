-- Streak v18, Prompt 2: platform configuration in a tracked table.
--
-- MEDIA_STORAGE_PROVIDER was only ever an environment variable, which is how it went unset in BOTH environments for two
-- streaks while R2 credentials sat unused (v16 found it, v17 backfilled the consequences). This table gives it a home
-- the application can read, fall back to, and SHOW in an admin UI - and gives the value a history in `updatedAt` /
-- `updatedById` rather than in someone's shell history.
--
-- Not tenant-scoped on purpose: it is deployment configuration, not tenant data, so there is no RLS policy and no
-- organizationId. Access is gated in the application to SUPER_ADMIN.
CREATE TABLE "SystemConfig" (
  "id"          TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "value"       JSONB NOT NULL,
  "description" TEXT,
  "updatedById" TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- The one row that matters today: default to LOCAL, which is what an unconfigured deployment already behaves like, so
-- the migration does not silently change storage behaviour on a host that has no R2 credentials.
INSERT INTO "SystemConfig" ("id", "key", "value", "description", "updatedAt")
VALUES ('systemconfig_media_provider', 'media.storageProvider', '"LOCAL_PERSISTENT_STORAGE"'::jsonb,
        'Where media bytes are written. LOCAL_PERSISTENT_STORAGE or CLOUDFLARE_OBJECT_STORAGE. The MEDIA_STORAGE_PROVIDER environment variable wins when set.', now())
ON CONFLICT ("key") DO NOTHING;

-- GRANTs: the table is read by the app at upload time and written only by /admin/settings.
GRANT SELECT, INSERT, UPDATE, DELETE ON "SystemConfig" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SystemConfig" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SystemConfig" TO ultraos_staging;

COMMENT ON TABLE "SystemConfig" IS 'Deployment-level configuration readable by the application (streak v18). Not tenant data; SUPER_ADMIN only.';
