-- Clock mode: RUNNING (clock keeps running through whistles) vs STOPPAGE (clock stops at every
-- whistle - standard/FIBA/NBA basketball). Recorded on the rule set and frozen per game in the
-- snapshot so a played game stays explicable.
--
-- Additive: existing rows default to RUNNING, matching how every game has behaved so far.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- CreateEnum
CREATE TYPE "ClockMode" AS ENUM ('RUNNING', 'STOPPAGE');

-- AlterTable
ALTER TABLE "RuleSet" ADD COLUMN "clockMode" "ClockMode" NOT NULL DEFAULT 'RUNNING';

-- AlterTable
ALTER TABLE "GameRuleSnapshot" ADD COLUMN "clockMode" "ClockMode" NOT NULL DEFAULT 'RUNNING';
