-- Optional foul detail: who was fouled (never required - some fouls, like technicals
-- or unclear contact, don't have a clearly attributable other party) and the foul type.

CREATE TYPE "FoulType" AS ENUM ('PERSONAL', 'TECHNICAL', 'FLAGRANT', 'OFFENSIVE');

ALTER TABLE "GameEvent" ADD COLUMN "fouledPlayerId" TEXT;
ALTER TABLE "GameEvent" ADD COLUMN "foulType" "FoulType";
CREATE INDEX "GameEvent_fouledPlayerId_idx" ON "GameEvent"("fouledPlayerId");
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_fouledPlayerId_fkey" FOREIGN KEY ("fouledPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NoveltyGameEvent" ADD COLUMN "fouledPlayerId" TEXT;
ALTER TABLE "NoveltyGameEvent" ADD COLUMN "foulType" "FoulType";
CREATE INDEX "NoveltyGameEvent_fouledPlayerId_idx" ON "NoveltyGameEvent"("fouledPlayerId");
ALTER TABLE "NoveltyGameEvent" ADD CONSTRAINT "NoveltyGameEvent_fouledPlayerId_fkey" FOREIGN KEY ("fouledPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
