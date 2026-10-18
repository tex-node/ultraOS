-- P15 I1: OCR scoresheet ingestion (basketball v1).
--
-- Two tenant tables + one new MediaAssetPurpose value:
--   ScoresheetTemplate - a sheet LAYOUT as data (column/row bindings, totals row, DNP marker), so a
--                        new league format is a row, not a deploy.
--   ScoresheetImport   - one uploaded sheet: the OCR extraction, the per-rule checksum results, the
--                        human-corrected batch fragment, and the review/ingest state machine.
--
-- Additive. Tenant rules per docs/patterns/tenant-database-migrations.md:
--   * organizationId + Organization FK
--   * RLS enabled AND forced + tenant_isolation policy
--   * GRANTs for BOTH runtime roles in this same file (this is the step that was missed twice:
--     GameControlGrant, then CoachingPlan - see the pattern doc)
--   * composite tenant FKs where the relation is REQUIRED. Every relation on ScoresheetImport is
--     nullable (a sheet can exist before a template/fixture/reviewer), and ScoresheetTemplate has
--     only its required Organization relation, so single-column FKs are correct here - MATCH SIMPLE
--     does not enforce a composite FK with a NULL column anyway.
--
-- Generated with `prisma migrate diff` against staging, hand-cleaned of the tool's usual noise (the
-- ~100 redundant `SET DEFAULT` statements and cosmetic `RenameIndex` drift), then extended with the
-- RLS + GRANT sections.

-- CreateEnum
CREATE TYPE "ScoresheetImportStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'FAILED', 'REVIEW_REQUIRED', 'APPROVED', 'INGESTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MediaAssetPurpose" ADD VALUE 'SCORESHEET_IMAGE';

-- CreateTable
CREATE TABLE "ScoresheetTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "name" TEXT NOT NULL,
    "sportSlug" TEXT NOT NULL DEFAULT 'basketball',
    "layout" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoresheetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoresheetImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "status" "ScoresheetImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "mediaAssetId" TEXT NOT NULL,
    "templateId" TEXT,
    "extractionVersion" TEXT NOT NULL DEFAULT 'unset',
    "extraction" JSONB,
    "corrected" JSONB,
    "checksums" JSONB,
    "sourceLabel" TEXT NOT NULL,
    "failureReason" TEXT,
    "fixtureId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoresheetImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoresheetTemplate_organizationId_sportSlug_active_idx" ON "ScoresheetTemplate"("organizationId", "sportSlug", "active");
CREATE UNIQUE INDEX "ScoresheetTemplate_organizationId_name_key" ON "ScoresheetTemplate"("organizationId", "name");
CREATE UNIQUE INDEX "ScoresheetTemplate_organizationId_id_key" ON "ScoresheetTemplate"("organizationId", "id");
CREATE INDEX "ScoresheetImport_organizationId_status_createdAt_idx" ON "ScoresheetImport"("organizationId", "status", "createdAt");
CREATE INDEX "ScoresheetImport_mediaAssetId_idx" ON "ScoresheetImport"("mediaAssetId");
CREATE UNIQUE INDEX "ScoresheetImport_organizationId_id_key" ON "ScoresheetImport"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "ScoresheetTemplate" ADD CONSTRAINT "ScoresheetTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoresheetImport" ADD CONSTRAINT "ScoresheetImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoresheetImport" ADD CONSTRAINT "ScoresheetImport_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoresheetImport" ADD CONSTRAINT "ScoresheetImport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScoresheetTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoresheetImport" ADD CONSTRAINT "ScoresheetImport_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoresheetImport" ADD CONSTRAINT "ScoresheetImport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RowLevelSecurity (Phase 1 Stage 4a pattern)
ALTER TABLE "ScoresheetTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScoresheetTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScoresheetTemplate" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

ALTER TABLE "ScoresheetImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScoresheetImport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScoresheetImport" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Restricted-role grants. Migrations run as the privileged role and this database has no ALTER
-- DEFAULT PRIVILEGES, so without this the app role cannot read either table at all (SQLSTATE 42501
-- on the first page that touches it). RLS is row access; this is table access. Both are required.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ScoresheetTemplate" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ScoresheetTemplate" TO ultraos_staging;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ScoresheetImport" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ScoresheetImport" TO ultraos_staging;
