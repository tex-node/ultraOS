-- Production already contains a pre-existing DraftPick row (from initial
-- environment seeding, before this column existed) with no recorded actor.
-- The original migration's NOT NULL constraint on "createdById" would fail
-- against that row rather than leave demo/legacy data untouched, so this
-- follow-up migration makes the column optional instead of backfilling a
-- fabricated actor onto a row nobody actually created through the app.
-- All new picks created through the application continue to populate it.
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_createdById_fkey";
ALTER TABLE "DraftPick" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
