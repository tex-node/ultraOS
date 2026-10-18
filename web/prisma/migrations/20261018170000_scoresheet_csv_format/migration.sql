-- P15 I1 pivot: a scoresheet can arrive as a scanned IMAGE or as a structured CSV export.
--
-- Why this matters: the IMAGE path depends on OCR, which measured 12/20 sheets producing a table and
-- 0/20 review-ready on the real LBCL screenshots. A CSV export from the same provider carries the same
-- numbers as text, so it skips Tesseract entirely - the operator uploads, the system validates with the
-- same checksum rules, a human approves, and the existing ingest path runs unchanged.
--
-- Additive on two EXISTING tenant tables (new enum + columns, and one column becoming nullable), so no
-- new RLS policy or GRANT is needed here - the shape the tenant-migration checklist treats differently.

CREATE TYPE "ScoresheetImportFormat" AS ENUM ('IMAGE', 'CSV');

ALTER TABLE "ScoresheetTemplate" ADD COLUMN "format" "ScoresheetImportFormat" NOT NULL DEFAULT 'IMAGE';

ALTER TABLE "ScoresheetImport" ADD COLUMN "format" "ScoresheetImportFormat" NOT NULL DEFAULT 'IMAGE';

-- A CSV import has no binary to keep: the file is parsed at upload time and the reviewed result lives
-- in `extraction`/`corrected`. Every existing row is an IMAGE and keeps its media asset.
ALTER TABLE "ScoresheetImport" ALTER COLUMN "mediaAssetId" DROP NOT NULL;

-- The review queue filters by format (CSV imports show no image pane).
CREATE INDEX "ScoresheetImport_organizationId_format_idx" ON "ScoresheetImport"("organizationId", "format");
