CREATE TYPE "CoachSeasonZeroDivision" AS ENUM ('MEN', 'WOMEN');

ALTER TABLE "Application" ADD COLUMN "coachSeasonZeroDivision" "CoachSeasonZeroDivision";
