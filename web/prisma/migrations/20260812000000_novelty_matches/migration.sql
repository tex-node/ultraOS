-- Exhibition/novelty match system (e.g. All-Star teams). Deliberately separate from
-- Club/SeasonClub/Fixture/Game so it never touches real league standings, while reusing
-- the same live-scoring shape (period/clock/events/stats) for operator familiarity.

CREATE TYPE "NoveltyMatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL', 'CANCELLED');

CREATE TABLE "NoveltyTeam" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "shortName"    TEXT,
    "logoUrl"      TEXT,
    "primaryColor" TEXT,
    "description"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoveltyTeam_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoveltyTeam_name_key" ON "NoveltyTeam"("name");

CREATE TABLE "NoveltyMatch" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "eventId"      TEXT,
    "venueId"      TEXT,
    "scheduledAt"  TIMESTAMP(3) NOT NULL,
    "status"       "NoveltyMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeTeamId"   TEXT NOT NULL,
    "awayTeamId"   TEXT NOT NULL,
    "homeScore"    INTEGER NOT NULL DEFAULT 0,
    "awayScore"    INTEGER NOT NULL DEFAULT 0,
    "winnerTeamId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoveltyMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NoveltyGame" (
    "id"                    TEXT NOT NULL,
    "matchId"               TEXT NOT NULL,
    "status"                "GameStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentPeriod"         INTEGER NOT NULL DEFAULT 1,
    "clockSecondsRemaining" INTEGER NOT NULL DEFAULT 600,
    "clockStartedAt"        TIMESTAMP(3),
    "startedAt"             TIMESTAMP(3),
    "endedAt"               TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoveltyGame_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoveltyGame_matchId_key" ON "NoveltyGame"("matchId");

CREATE TABLE "NoveltyGameEvent" (
    "id"           TEXT NOT NULL,
    "gameId"       TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "playerId"     TEXT,
    "eventType"    "GameEventType" NOT NULL,
    "points"       INTEGER,
    "period"       INTEGER NOT NULL,
    "clockSeconds" INTEGER NOT NULL,
    "description"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoveltyGameEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NoveltyGameEvent_gameId_createdAt_idx" ON "NoveltyGameEvent"("gameId", "createdAt");
CREATE INDEX "NoveltyGameEvent_playerId_idx" ON "NoveltyGameEvent"("playerId");

CREATE TABLE "NoveltyPlayerStat" (
    "id"        TEXT NOT NULL,
    "gameId"    TEXT NOT NULL,
    "playerId"  TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "points"    INTEGER NOT NULL DEFAULT 0,
    "rebounds"  INTEGER NOT NULL DEFAULT 0,
    "assists"   INTEGER NOT NULL DEFAULT 0,
    "steals"    INTEGER NOT NULL DEFAULT 0,
    "blocks"    INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls"     INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NoveltyPlayerStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoveltyPlayerStat_gameId_playerId_key" ON "NoveltyPlayerStat"("gameId", "playerId");
CREATE INDEX "NoveltyPlayerStat_teamId_idx" ON "NoveltyPlayerStat"("teamId");

ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "NoveltyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "NoveltyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NoveltyMatch" ADD CONSTRAINT "NoveltyMatch_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "NoveltyTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoveltyGame" ADD CONSTRAINT "NoveltyGame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "NoveltyMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NoveltyGameEvent" ADD CONSTRAINT "NoveltyGameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "NoveltyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoveltyGameEvent" ADD CONSTRAINT "NoveltyGameEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "NoveltyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NoveltyGameEvent" ADD CONSTRAINT "NoveltyGameEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoveltyPlayerStat" ADD CONSTRAINT "NoveltyPlayerStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "NoveltyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoveltyPlayerStat" ADD CONSTRAINT "NoveltyPlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NoveltyPlayerStat" ADD CONSTRAINT "NoveltyPlayerStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "NoveltyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
