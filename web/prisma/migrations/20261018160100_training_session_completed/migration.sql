-- P15 I3: a session needs to be markable as COMPLETE.
--
-- TrainingSession had no completion state at all (it is a scheduled record), so "the coach ticks the
-- session off" had nowhere to live. A nullable timestamp is the minimal honest representation: null =
-- not completed, set = completed at that moment (and who by is on the existing createdBy/notes trail).
ALTER TABLE "TrainingSession" ADD COLUMN "completedAt" TIMESTAMP(3);

-- The Coach Hub's "this week" view and the overdue flag both filter on it.
CREATE INDEX "TrainingSession_organizationId_completedAt_idx" ON "TrainingSession"("organizationId", "completedAt");
