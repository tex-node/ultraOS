-- Scoped game-control grants (Access dashboard).
--
-- Lets an admin give a user game control for one competition (tournament), season or event, or
-- organization-wide (all three scope columns NULL). Replaces the need for a league-wide role just to
-- run one tournament. Revoked rows are kept (revokedAt) and ignored by readers.
--
-- Additive: new enum + table. Tenant-scoped: RLS + FORCE, matching the phase 4a pattern.
--
-- NOT APPLIED by this commit - applied per environment via prisma migrate deploy.

-- CreateEnum
CREATE TYPE "GameControlRole" AS ENUM ('EVENT_ADMIN', 'GAME_CONTROLLER', 'SCOREKEEPER', 'STATISTICIAN');

-- CreateTable
CREATE TABLE "GameControlGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
  "userId" TEXT NOT NULL,
  "role" "GameControlRole" NOT NULL,
  "competitionId" TEXT,
  "seasonId" TEXT,
  "eventId" TEXT,
  "grantedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameControlGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameControlGrant_organizationId_userId_revokedAt_idx" ON "GameControlGrant"("organizationId", "userId", "revokedAt");
CREATE INDEX "GameControlGrant_organizationId_competitionId_idx" ON "GameControlGrant"("organizationId", "competitionId");
CREATE INDEX "GameControlGrant_organizationId_seasonId_idx" ON "GameControlGrant"("organizationId", "seasonId");
CREATE INDEX "GameControlGrant_organizationId_eventId_idx" ON "GameControlGrant"("organizationId", "eventId");

-- AddForeignKey
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameControlGrant" ADD CONSTRAINT "GameControlGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RowLevelSecurity (Phase 1 Stage 4a pattern)
ALTER TABLE "GameControlGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameControlGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GameControlGrant" FOR ALL USING ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')) WITH CHECK ("organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro'));
