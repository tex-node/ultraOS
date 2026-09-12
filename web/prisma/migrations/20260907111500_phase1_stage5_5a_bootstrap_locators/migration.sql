-- Phase 1, Stage 5.5A: Global tenant bootstrap locator foundation.
--
-- These tables are deliberately global bootstrap infrastructure. They are read
-- before tenant context exists and store only routing provenance:
-- selector/hash -> organizationId + authoritative tenant resource id.
--
-- Do not enable tenant RLS on these tables in this stage, do not add the Neon
-- Ultra organizationId database default, and do not remove the existing Stage
-- 4a tenant-table RLS fallback.

CREATE TYPE "PublicResourceLocatorType" AS ENUM (
  'ATHLETE',
  'CLUB',
  'EVENT',
  'FIXTURE',
  'MEDIA_ASSET'
);

CREATE TYPE "PublicTokenLocatorType" AS ENUM (
  'ORDER',
  'TICKET'
);

CREATE TYPE "PublicLocatorStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE'
);

CREATE TABLE "PublicResourceLocator" (
  "id" TEXT NOT NULL,
  "resourceType" "PublicResourceLocatorType" NOT NULL,
  "publicKey" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" "PublicLocatorStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublicResourceLocator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicTokenLocator" (
  "id" TEXT NOT NULL,
  "tokenType" "PublicTokenLocatorType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" "PublicLocatorStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublicTokenLocator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicResourceLocator_resourceType_publicKey_key"
  ON "PublicResourceLocator"("resourceType", "publicKey");

CREATE INDEX "PublicResourceLocator_organizationId_resourceType_status_idx"
  ON "PublicResourceLocator"("organizationId", "resourceType", "status");

CREATE INDEX "PublicResourceLocator_resourceType_resourceId_idx"
  ON "PublicResourceLocator"("resourceType", "resourceId");

CREATE UNIQUE INDEX "PublicTokenLocator_tokenType_tokenHash_key"
  ON "PublicTokenLocator"("tokenType", "tokenHash");

CREATE INDEX "PublicTokenLocator_organizationId_tokenType_status_idx"
  ON "PublicTokenLocator"("organizationId", "tokenType", "status");

CREATE INDEX "PublicTokenLocator_tokenType_resourceId_idx"
  ON "PublicTokenLocator"("tokenType", "resourceId");

ALTER TABLE "PublicResourceLocator"
  ADD CONSTRAINT "PublicResourceLocator_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublicTokenLocator"
  ADD CONSTRAINT "PublicTokenLocator_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PublicResourceLocator" TO ultraos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PublicTokenLocator" TO ultraos_app;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ultraos_staging') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PublicResourceLocator" TO ultraos_staging;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PublicTokenLocator" TO ultraos_staging;
  END IF;
END $$;
