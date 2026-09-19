-- Stats Phase 3: NCAA-style foul depth and free-throw sequencing.
--
--  - "GameEvent"."technicalClass": Class A vs Class B technical fouls (NULL unless TECHNICAL).
--  - "GameEvent"."foulTarget": who the foul was assessed to (PLAYER default; BENCH/COACH for
--    bench and coaching-staff technicals, which carry no playerId).
--  - "GameEvent"."freeThrowsAwarded" + "causedByEventId": a foul awards N free throws, and each
--    resulting FT points back at its foul. Pending FTs are derived, never stored.
--
-- Additive and nullable/defaulted; existing rows are untouched in meaning.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- CreateEnum
CREATE TYPE "TechnicalClass" AS ENUM ('CLASS_A', 'CLASS_B');

-- CreateEnum
CREATE TYPE "FoulTarget" AS ENUM ('PLAYER', 'BENCH', 'COACH');

-- AlterTable
ALTER TABLE "GameEvent" ADD COLUMN "technicalClass" "TechnicalClass";
ALTER TABLE "GameEvent" ADD COLUMN "foulTarget" "FoulTarget" DEFAULT 'PLAYER';
ALTER TABLE "GameEvent" ADD COLUMN "freeThrowsAwarded" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "causedByEventId" TEXT;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_causedByEventId_fkey" FOREIGN KEY ("causedByEventId") REFERENCES "GameEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;