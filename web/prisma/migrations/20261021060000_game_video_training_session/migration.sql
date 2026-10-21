-- Streak v13, Prompt 2: a training clip belongs to the session it was filmed at.
--
-- GameVideo already has an organizationId and is tenant-scoped; this adds a nullable link, an index to make "the
-- videos for this session" a cheap read, and the composite tenant-aware foreign key the schema uses elsewhere, so a
-- video cannot be attached to a session in another organization.
ALTER TABLE "GameVideo" ADD COLUMN IF NOT EXISTS "trainingSessionId" TEXT;

ALTER TABLE "GameVideo"
  ADD CONSTRAINT "GameVideo_trainingSessionId_fkey"
  FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "GameVideo_organizationId_trainingSessionId_idx"
  ON "GameVideo"("organizationId", "trainingSessionId");
