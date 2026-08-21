-- Ultra canonical scoring model: versioned rules (RuleSet / GameRuleSnapshot), an evolved
-- GameEvent ledger (sequencing, before/after scores, void/correction semantics, 4PT and
-- Ultra Time markers, assist/shot-location fields), stat provenance, and per-game data
-- capability. Purely additive: every new column is nullable or has a safe default, so all
-- existing Season Zero rows (including the 11 just-imported games) remain valid as-is.

-- New enum values on the existing GameEventType (each ADD VALUE must be its own statement).
ALTER TYPE "GameEventType" ADD VALUE 'GAME_STARTED';
ALTER TYPE "GameEventType" ADD VALUE 'PERIOD_STARTED';
ALTER TYPE "GameEventType" ADD VALUE 'PERIOD_ENDED';
ALTER TYPE "GameEventType" ADD VALUE 'GAME_ENDED';
ALTER TYPE "GameEventType" ADD VALUE 'ULTRA_TIME_STARTED';
ALTER TYPE "GameEventType" ADD VALUE 'ULTRA_TIME_ENDED';
ALTER TYPE "GameEventType" ADD VALUE 'SHOT_ATTEMPT';
ALTER TYPE "GameEventType" ADD VALUE 'SHOT_MADE';
ALTER TYPE "GameEventType" ADD VALUE 'SHOT_MISSED';
ALTER TYPE "GameEventType" ADD VALUE 'FREE_THROW_ATTEMPT';
ALTER TYPE "GameEventType" ADD VALUE 'FREE_THROW_MADE';
ALTER TYPE "GameEventType" ADD VALUE 'FREE_THROW_MISSED';
ALTER TYPE "GameEventType" ADD VALUE 'SCORE_CORRECTION';
ALTER TYPE "GameEventType" ADD VALUE 'EVENT_CORRECTION';

-- New enums.
CREATE TYPE "GameEventStatus" AS ENUM ('ACTIVE', 'VOIDED', 'CORRECTED', 'SUPERSEDED');
CREATE TYPE "FourPointQualificationMethod" AS ENUM ('MANUAL_SCORER_SELECTION', 'COURT_ZONE', 'SHOT_COORDINATE', 'EXTERNAL_PROVIDER');
CREATE TYPE "FourPointDefinitionType" AS ENUM ('OPPOSITE_HALF_ORIGIN', 'DESIGNATED_ZONE', 'DISABLED');
CREATE TYPE "MandatorySubstitutionPolicy" AS ENUM ('NONE', 'AT_LEAST_ONE_PER_HALF', 'FULL_ROTATION');
CREATE TYPE "GameDataCapability" AS ENUM ('BOX_SCORE_ONLY', 'PLAY_BY_PLAY', 'ULTRA_NATIVE_EVENTS', 'SHOT_LOCATION', 'VISION_ENRICHED');
CREATE TYPE "StatDataSource" AS ENUM ('ULTRA_NATIVE_LIVE_SCORER', 'FIBA_LIVESTATS_PDF_IMPORT', 'GENIUS_SPORTS_IMPORT', 'MANUAL_ADMIN_ENTRY', 'CSV_IMPORT', 'EXTERNAL_PROVIDER');

-- Game: Ultra Time state, event sequencing, capability + provenance category.
ALTER TABLE "Game" ADD COLUMN "isUltraTimeActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "nextEventSequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Game" ADD COLUMN "statSource" "StatDataSource";
ALTER TABLE "Game" ADD COLUMN "sourceImportBatchId" TEXT;
ALTER TABLE "Game" ADD COLUMN "dataCapability" "GameDataCapability" NOT NULL DEFAULT 'BOX_SCORE_ONLY';

-- RuleSet: versioned, named rule configuration, optionally scoped to a Season.
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seasonId" TEXT,
    "periodCount" INTEGER NOT NULL DEFAULT 2,
    "periodDurationSeconds" INTEGER NOT NULL DEFAULT 600,
    "overtimeDurationSeconds" INTEGER NOT NULL DEFAULT 300,
    "shotClockSeconds" INTEGER NOT NULL DEFAULT 20,
    "fourPointEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fourPointDefinitionType" "FourPointDefinitionType" NOT NULL DEFAULT 'OPPOSITE_HALF_ORIGIN',
    "fourPointBaseValue" INTEGER NOT NULL DEFAULT 4,
    "ultraTimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ultraTimeStartRemainingSeconds" INTEGER NOT NULL DEFAULT 60,
    "ultraTimeMultiplier" INTEGER NOT NULL DEFAULT 2,
    "ultraTimeAppliesFinalPeriodOnly" BOOLEAN NOT NULL DEFAULT true,
    "mandatorySubstitutionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mandatorySubstitutionPeriod" INTEGER NOT NULL DEFAULT 2,
    "mandatorySubstitutionPolicy" "MandatorySubstitutionPolicy" NOT NULL DEFAULT 'AT_LEAST_ONE_PER_HALF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RuleSet_seasonId_isActive_idx" ON "RuleSet"("seasonId", "isActive");

ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GameRuleSnapshot: frozen copy of every rule value a specific Game was played under.
CREATE TABLE "GameRuleSnapshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ruleSetId" TEXT,
    "ruleSetName" TEXT NOT NULL,
    "ruleSetVersion" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL,
    "periodDurationSeconds" INTEGER NOT NULL,
    "overtimeDurationSeconds" INTEGER NOT NULL,
    "shotClockSeconds" INTEGER NOT NULL,
    "fourPointEnabled" BOOLEAN NOT NULL,
    "fourPointDefinitionType" "FourPointDefinitionType" NOT NULL,
    "fourPointBaseValue" INTEGER NOT NULL,
    "ultraTimeEnabled" BOOLEAN NOT NULL,
    "ultraTimeStartRemainingSeconds" INTEGER NOT NULL,
    "ultraTimeMultiplier" INTEGER NOT NULL,
    "ultraTimeAppliesFinalPeriodOnly" BOOLEAN NOT NULL,
    "mandatorySubstitutionEnabled" BOOLEAN NOT NULL,
    "mandatorySubstitutionPeriod" INTEGER NOT NULL,
    "mandatorySubstitutionPolicy" "MandatorySubstitutionPolicy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRuleSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameRuleSnapshot_gameId_key" ON "GameRuleSnapshot"("gameId");

ALTER TABLE "GameRuleSnapshot" ADD CONSTRAINT "GameRuleSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRuleSnapshot" ADD CONSTRAINT "GameRuleSnapshot_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Season: inverse relation for RuleSet (no column — handled by RuleSet.seasonId above).

-- GameEvent: ledger evolution.
-- Game/period-level events (ULTRA_TIME_STARTED/ENDED, GAME_STARTED, etc.) aren't
-- attributable to either team, so seasonClubId can no longer be mandatory.
ALTER TABLE "GameEvent" ALTER COLUMN "seasonClubId" DROP NOT NULL;
ALTER TABLE "GameEvent" ADD COLUMN "sequenceNumber" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "made" BOOLEAN;
ALTER TABLE "GameEvent" ADD COLUMN "isFourPointAttempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GameEvent" ADD COLUMN "isUltraTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GameEvent" ADD COLUMN "fourPointQualificationMethod" "FourPointQualificationMethod";
ALTER TABLE "GameEvent" ADD COLUMN "assistedByPlayerId" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "x" DOUBLE PRECISION;
ALTER TABLE "GameEvent" ADD COLUMN "y" DOUBLE PRECISION;
ALTER TABLE "GameEvent" ADD COLUMN "courtZone" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "homeScoreBefore" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "awayScoreBefore" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "homeScoreAfter" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "awayScoreAfter" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "source" "StatDataSource";
ALTER TABLE "GameEvent" ADD COLUMN "sourceEventId" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "createdById" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "status" "GameEventStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "GameEvent" ADD COLUMN "correctedAt" TIMESTAMP(3);
ALTER TABLE "GameEvent" ADD COLUMN "correctedById" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "supersedesEventId" TEXT;

CREATE INDEX "GameEvent_gameId_sequenceNumber_idx" ON "GameEvent"("gameId", "sequenceNumber");
CREATE INDEX "GameEvent_assistedByPlayerId_idx" ON "GameEvent"("assistedByPlayerId");
CREATE INDEX "GameEvent_status_idx" ON "GameEvent"("status");

ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_assistedByPlayerId_fkey" FOREIGN KEY ("assistedByPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "GameEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlayerStat: Ultra-specific aggregates (NULL = NOT_CAPTURED, never conflated with a real 0)
-- plus provenance.
ALTER TABLE "PlayerStat" ADD COLUMN "fourPointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "fourPointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "assistedFourPointMakes" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "unassistedFourPointMakes" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimePoints" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFieldGoalsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFieldGoalsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeTwoPointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeTwoPointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeThreePointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeThreePointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFourPointsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFourPointsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFreeThrowsMade" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFreeThrowsAttempted" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeRebounds" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeAssists" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeSteals" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeTurnovers" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeBlocks" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "ultraTimeFouls" INTEGER;
ALTER TABLE "PlayerStat" ADD COLUMN "statSource" "StatDataSource";

-- TeamStat: Ultra-specific team aggregates + provenance.
ALTER TABLE "TeamStat" ADD COLUMN "fourPointsMade" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "fourPointsAttempted" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "ultraTimePointsFor" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "ultraTimePointsAgainst" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "ultraTimeFieldGoalsMade" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "ultraTimeFieldGoalsAttempted" INTEGER;
ALTER TABLE "TeamStat" ADD COLUMN "statSource" "StatDataSource";
