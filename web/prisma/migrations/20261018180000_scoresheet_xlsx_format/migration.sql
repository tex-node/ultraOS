-- Streak v4, Prompt 2: a scoresheet can arrive as an .xlsx workbook.
--
-- The workbook's first sheet is converted to the same string matrix a CSV produces and parsed by the same
-- function, so this is only a label on the import row (and what the review queue displays), not a second
-- pipeline. Additive enum value on an existing tenant table - no RLS or GRANT change (RLS is per table,
-- and the column already exists on a table the app role can write).
--
-- `ALTER TYPE ... ADD VALUE` is non-transactional in older PostgreSQL; this project's PostgreSQL 16
-- accepts it in a migration transaction as long as the new value is not USED in the same transaction.
ALTER TYPE "ScoresheetImportFormat" ADD VALUE IF NOT EXISTS 'XLSX';
