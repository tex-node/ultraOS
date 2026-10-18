-- P15 C1 remainder / I2 first slice: CoachingPlan adoption.
--
-- The Player Development Engine (src/lib/coaching/player-development.ts) has always produced a plan
-- and never recorded that a coach accepted one. This adds the durable record: which player, which
-- season club, the focus-area snapshot the engine produced, the engine version that produced it,
-- who adopted it and when.
--
-- Additive: one enum + one table + reference-data seeds. No existing column, index or constraint is
-- altered or dropped. Tenant-scoped: RLS enabled + forced, tenant_isolation policy, and composite
-- tenant-aware FKs to Player and SeasonClub (Phase 1 Stage 5.4B pattern) so a plan can never
-- reference another organization's player even under a role that bypasses RLS.
--
-- Two constraints Prisma cannot express are hand-authored below:
--   1. CoachingPlan_one_active_per_player - a PARTIAL unique index (WHERE status = 'ACTIVE'), so a
--      player has at most one current plan and history is kept as SUPERSEDED rows.
--   2. The TrainingMetricDefinition seeds, which are platform-global reference data (no
--      organizationId, no RLS - deliberately, like Sport).
--
-- Generated via `prisma migrate diff` against staging, then hand-cleaned of the tool's usual noise
-- (the ~104 redundant `SET DEFAULT` statements and cosmetic `RenameIndex` drift, both documented
-- since Stage 0/3b) and extended with the RLS + partial-index + seed sections.

-- CreateEnum
CREATE TYPE "CoachingPlanStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "CoachingPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "playerId" TEXT NOT NULL,
    "seasonClubId" TEXT NOT NULL,
    "status" "CoachingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "planVersion" TEXT NOT NULL,
    "focusAreas" JSONB NOT NULL,
    "reviewWindowGames" INTEGER NOT NULL,
    "note" TEXT,
    "adoptedById" TEXT NOT NULL,
    "adoptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachingPlan_supersedesId_key" ON "CoachingPlan"("supersedesId");
CREATE INDEX "CoachingPlan_organizationId_playerId_status_idx" ON "CoachingPlan"("organizationId", "playerId", "status");
CREATE INDEX "CoachingPlan_organizationId_seasonClubId_status_idx" ON "CoachingPlan"("organizationId", "seasonClubId", "status");
CREATE UNIQUE INDEX "CoachingPlan_organizationId_id_key" ON "CoachingPlan"("organizationId", "id");

-- Hand-authored: at most ONE active plan per player. History is kept as SUPERSEDED/COMPLETED/
-- ABANDONED rows, so this partial index is what makes "the player's current plan" unambiguous
-- without a read-then-write race.
CREATE UNIQUE INDEX "CoachingPlan_one_active_per_player"
    ON "CoachingPlan"("organizationId", "playerId")
    WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_organizationId_playerId_fkey" FOREIGN KEY ("organizationId", "playerId") REFERENCES "Player"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_organizationId_seasonClubId_fkey" FOREIGN KEY ("organizationId", "seasonClubId") REFERENCES "SeasonClub"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_adoptedById_fkey" FOREIGN KEY ("adoptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CoachingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RowLevelSecurity (Phase 1 Stage 4a pattern)
ALTER TABLE "CoachingPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoachingPlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CoachingPlan" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));

-- Reference data: one TrainingMetricDefinition per Player Development Engine dimension
-- (DIMENSIONS in src/lib/coaching/player-development.ts), so an adopted plan's Target metricKey has
-- a definition to point at once I3 starts logging completions. Platform-global by design - no
-- organizationId, no RLS, same as Sport.
--
-- The keys are the engine's own ("game.ts_pct"...), NOT the shorthand the program brief used
-- ("FT_PCT", "TS_PCT"...); the engine's keys are what Target.metricKey actually carries.
INSERT INTO "TrainingMetricDefinition" ("id", "key", "name", "unit", "valueType", "active", "updatedAt") VALUES
  ('tmd_game_ts_pct',     'game.ts_pct',     'True shooting %',            '%',        'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_ft_pct',     'game.ft_pct',     'Free-throw %',               '%',        'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_3p_pct',     'game.3p_pct',     'Three-point %',              '%',        'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_4p_pct',     'game.4p_pct',     'Four-point %',               '%',        'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_ast_pg',     'game.ast_pg',     'Assists per game',           'per game', 'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_tov_pg',     'game.tov_pg',     'Turnovers per game',         'per game', 'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_reb_pg',     'game.reb_pg',     'Rebounds per game',          'per game', 'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_stl_blk_pg', 'game.stl_blk_pg', 'Steals + blocks per game',   'per game', 'NUMERIC', true, CURRENT_TIMESTAMP),
  ('tmd_game_pf_pg',      'game.pf_pg',      'Fouls per game',             'per game', 'NUMERIC', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
