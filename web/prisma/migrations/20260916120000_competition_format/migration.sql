-- Multi-sport: competition format (round-robin league, single-elimination knockout, group stage).
-- Drives fixture generation and whether a level score is a valid final result (knockout matches must
-- be resolved by extra time/penalties rather than finalized as a draw).
--
-- Additive: new enum + a defaulted column; existing competitions become ROUND_ROBIN.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- CreateEnum
CREATE TYPE "CompetitionFormat" AS ENUM ('ROUND_ROBIN', 'KNOCKOUT', 'GROUP_STAGE');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "format" "CompetitionFormat" NOT NULL DEFAULT 'ROUND_ROBIN';
