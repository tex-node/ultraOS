-- Ultra Rules Engine: 20-second shot clock on Game, shot provenance (basePointValue/multiplier)
-- on GameEvent for Ultra Time (2x scoring in the final minute). Purely additive, no data change.

ALTER TABLE "Game" ADD COLUMN "shotClockSecondsRemaining" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Game" ADD COLUMN "shotClockStartedAt" TIMESTAMP(3);

ALTER TABLE "GameEvent" ADD COLUMN "basePointValue" INTEGER;
ALTER TABLE "GameEvent" ADD COLUMN "multiplier" INTEGER;
