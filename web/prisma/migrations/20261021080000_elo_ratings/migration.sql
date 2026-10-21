-- Streak v13, Prompt 3: historical Elo ratings, one row per rated competitor per sport.
--
-- 5-step tenant checklist:
--   1. tenant column (organizationId)           2. composite unique (organizationId, id)
--   3. RLS enabled AND forced                   4. tenant_isolation policy on app.current_org_id
--   5. runtime-role GRANTs in this same file, for all three roles
--
-- A competitor is a SeasonClub (team sports) or an Entrant (individual sports), never both, and the table carries a
-- CHECK for that rather than trusting every writer to remember it.
CREATE TABLE "EloRating" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "sportId"        TEXT NOT NULL,
  "seasonClubId"   TEXT,
  "entrantId"      TEXT,
  "rating"         DOUBLE PRECISION NOT NULL DEFAULT 1500,
  "games"          INTEGER NOT NULL DEFAULT 0,
  "wins"           INTEGER NOT NULL DEFAULT 0,
  "losses"         INTEGER NOT NULL DEFAULT 0,
  "draws"          INTEGER NOT NULL DEFAULT 0,
  "lastChange"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EloRating_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EloRating_subject_chk" CHECK (
    ("seasonClubId" IS NOT NULL AND "entrantId" IS NULL) OR
    ("seasonClubId" IS NULL AND "entrantId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "EloRating_organizationId_id_key" ON "EloRating"("organizationId", "id");
CREATE UNIQUE INDEX "EloRating_organizationId_sportId_seasonClubId_key"
  ON "EloRating"("organizationId", "sportId", "seasonClubId");
CREATE UNIQUE INDEX "EloRating_organizationId_sportId_entrantId_key"
  ON "EloRating"("organizationId", "sportId", "entrantId");
CREATE INDEX "EloRating_organizationId_sportId_rating_idx" ON "EloRating"("organizationId", "sportId", "rating");

ALTER TABLE "EloRating" ADD CONSTRAINT "EloRating_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EloRating" ADD CONSTRAINT "EloRating_sportId_fkey"
  FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EloRating" ADD CONSTRAINT "EloRating_seasonClubId_fkey"
  FOREIGN KEY ("seasonClubId") REFERENCES "SeasonClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EloRating" ADD CONSTRAINT "EloRating_entrantId_fkey"
  FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3-4. Row-level security, forced, with the canonical policy shape.
ALTER TABLE "EloRating" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EloRating" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "EloRating"
  USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text))
  WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'::text));

-- 5. Runtime-role grants, in the same file.
GRANT SELECT, INSERT, UPDATE, DELETE ON "EloRating" TO ultraos;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EloRating" TO ultraos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EloRating" TO ultraos_staging;
