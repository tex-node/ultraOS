-- Editable competition format.
--
--  - "Competition"."groupCount": default number of groups for a GROUP_STAGE competition.
--  - "Division"."format" / "Division"."groupCount": optional per-division override. Null inherits the
--    competition value, so one competition can run a league in one division and a knockout in another.
--
-- Additive: existing rows inherit (divisions keep NULL), and every existing competition gets the
-- previous hard-coded default of 2 groups.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Division" ADD COLUMN "format" "CompetitionFormat";
ALTER TABLE "Division" ADD COLUMN "groupCount" INTEGER;
