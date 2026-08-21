-- G.15 live data engine: statistician console provenance + score reconciliation gate.
-- Purely additive: two new enum values and two nullable columns. No existing row changes.

-- New GameEventType values for statistician-console rebound entry (splits the coarse REBOUND
-- type the scorer console still uses, matching PlayerStat.offensiveRebounds/defensiveRebounds).
ALTER TYPE "GameEventType" ADD VALUE 'OFFENSIVE_REBOUND';
ALTER TYPE "GameEventType" ADD VALUE 'DEFENSIVE_REBOUND';

-- New StatDataSource value distinguishing the independent statistician console from the
-- scorer console, so their events can be compared for reconciliation.
ALTER TYPE "StatDataSource" ADD VALUE 'ULTRA_NATIVE_LIVE_STATISTICIAN';

-- Game: statistics-verification gate, separate from Fixture/Game FINAL status.
ALTER TABLE "Game" ADD COLUMN "statisticsVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Game" ADD COLUMN "statisticsVerifiedById" TEXT;
