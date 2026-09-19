-- Competition formats: Swiss, double elimination and ladder join the enum. Uses the rename
-- pattern (not ALTER TYPE ADD VALUE, which cannot run inside a migration transaction).
-- Additive: existing rows keep their values.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

CREATE TYPE "CompetitionFormat_new" AS ENUM ('ROUND_ROBIN', 'KNOCKOUT', 'GROUP_STAGE', 'SWISS', 'DOUBLE_ELIMINATION', 'LADDER');

ALTER TABLE "Competition" ALTER COLUMN "format" DROP DEFAULT;
ALTER TABLE "Competition" ALTER COLUMN "format" TYPE "CompetitionFormat_new" USING "format"::text::"CompetitionFormat_new";
ALTER TYPE "CompetitionFormat" RENAME TO "CompetitionFormat_old";
ALTER TYPE "CompetitionFormat_new" RENAME TO "CompetitionFormat";
ALTER TABLE "Division" ALTER COLUMN "format" TYPE "CompetitionFormat" USING "format"::text::"CompetitionFormat";
DROP TYPE "CompetitionFormat_old";
ALTER TABLE "Competition" ALTER COLUMN "format" SET DEFAULT 'ROUND_ROBIN';