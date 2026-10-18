-- P15 I3: link an adopted CoachingPlan to the TrainingSession that delivers it.
--
-- Additive column + FK on an EXISTING tenant table. No new table, so no new RLS policy or GRANT is
-- required here (TrainingSession already has both); this is the one shape of migration the
-- tenant-database-migrations checklist treats differently.
--
-- ON DELETE SET NULL: deleting a plan must not delete the training history that delivered it.
ALTER TABLE "TrainingSession" ADD COLUMN "coachingPlanId" TEXT;

CREATE INDEX "TrainingSession_coachingPlanId_idx" ON "TrainingSession"("coachingPlanId");

ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_coachingPlanId_fkey"
  FOREIGN KEY ("coachingPlanId") REFERENCES "CoachingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
