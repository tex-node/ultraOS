-- G.16 canonical live statistics: event-derived stat materialization provenance, structured
-- substitution model, and starting-five capture. Purely additive: one new enum value, one new
-- nullable column with its FK/index, and one new table. No existing row changes.

-- New StatDataSource value for materialized PlayerStat/TeamStat rows (rebuildGameStatsFromEvents).
ALTER TYPE "StatDataSource" ADD VALUE 'EVENT_DERIVED';

-- GameEvent: structured substitution model. For eventType SUBSTITUTION, playerId is the player
-- coming IN and substitutedOutPlayerId is the player going OUT of the same swap.
ALTER TABLE "GameEvent" ADD COLUMN "substitutedOutPlayerId" TEXT;
CREATE INDEX "GameEvent_substitutedOutPlayerId_idx" ON "GameEvent"("substitutedOutPlayerId");
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_substitutedOutPlayerId_fkey" FOREIGN KEY ("substitutedOutPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GameStarter: structured starting-five capture, exactly 5 rows per SeasonClub per Game once
-- confirmed. Never auto-selected or inferred - see STARTING_FIVE_AND_SUBSTITUTIONS.md.
CREATE TABLE "GameStarter" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameStarter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameStarter_gameId_playerId_key" ON "GameStarter"("gameId", "playerId");
CREATE INDEX "GameStarter_gameId_seasonClubId_idx" ON "GameStarter"("gameId", "seasonClubId");

ALTER TABLE "GameStarter" ADD CONSTRAINT "GameStarter_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameStarter" ADD CONSTRAINT "GameStarter_seasonClubId_fkey" FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameStarter" ADD CONSTRAINT "GameStarter_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
