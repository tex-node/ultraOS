-- Additive support for importing a full external box score (e.g. a FIBA/Genius Sports
-- report) into PlayerStat/TeamStat, plus period-level score progression for games where
-- only period totals (not play-by-play GameEvent timestamps) are available.
-- Purely additive: all new columns are nullable, no existing data or behavior changes.

-- Game: provenance for a result entered via an external report rather than the live scorer.
ALTER TABLE "Game" ADD COLUMN "resultSource" TEXT;
ALTER TABLE "Game" ADD COLUMN "resultImportedAt" TIMESTAMP(3);

-- GamePeriodScore: cumulative score at the end of each period.
CREATE TABLE "GamePeriodScore" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePeriodScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GamePeriodScore_gameId_period_key" ON "GamePeriodScore"("gameId", "period");

ALTER TABLE "GamePeriodScore" ADD CONSTRAINT "GamePeriodScore_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlayerStat: full box-score detail, all nullable.
ALTER TABLE "PlayerStat" ADD COLUMN "fieldGoalsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "fieldGoalsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "twoPointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "twoPointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "threePointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "threePointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "freeThrowsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "freeThrowsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "offensiveRebounds" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "defensiveRebounds" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "foulsDrawn" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "plusMinus" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "efficiency" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "didNotPlay" BOOLEAN NOT NULL DEFAULT false;

-- TeamStat: advanced team metrics, all nullable.
ALTER TABLE "TeamStat" ADD COLUMN "pointsFromTurnovers" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "pointsInPaint" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "pointsInPaintMade" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "pointsInPaintAttempted" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "secondChancePoints" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "fastBreakPoints" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "fastBreakPointsFromTurnovers" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "benchPoints" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "biggestLead" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "biggestScoringRun" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "pointsPerPossession" DECIMAL(4,2);
ALTER TABLE "TeamStat" ADD COLUMN "leadChanges" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "timesTied" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "timeWithLeadSeconds" INTEGER;
