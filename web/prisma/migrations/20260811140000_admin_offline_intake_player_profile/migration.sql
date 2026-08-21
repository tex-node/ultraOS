-- Staged eligibility profile for PLAYER-type offline intake records, so a new
-- player can be recorded with partial data (name/phone/gender) now and completed
-- (dateOfBirth/dominantHand/position/heightCm/weightKg) later, without ever
-- creating an Athlete/Player row with fabricated required fields.
ALTER TABLE "AdminOfflineIntake" ADD COLUMN "playerProfile" JSONB;
ALTER TABLE "AdminOfflineIntake" ADD COLUMN "provisionedAthleteId" TEXT;
ALTER TABLE "AdminOfflineIntake" ADD COLUMN "provisionedPlayerId" TEXT;
