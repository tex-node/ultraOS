-- Multi-sport Stage 1 (S1.3): organization-scoped overrides for a sport definition.
--
-- Adds one tenant-owned table, SportDefinitionOverride, storing validated customization of a
-- registered sport definition (rule values, default divisions). The code registry
-- (web/src/lib/sports) remains the authority; this table never defines behaviour on its own.
--
-- Additive only. No existing table, column, constraint, index, RLS policy, or default is altered
-- or dropped. Sport is a global catalog (no organizationId, no RLS), so sportId is a plain FK.
--
-- Method: hand-authored to match Prisma's DDL conventions (see
-- 20260912130000_team_competition_sport_rosters). RLS policies and grants are database-only and
-- are authored separately in 20260913090100_sport_definition_override_rls.
--
-- NOT APPLIED anywhere by this commit.
--
-- Rollback:
--   * Pre-data, disposable rehearsal ONLY: drop the table.
--   * Post-data, once a real organization has customized a sport: operationally IRREVERSIBLE by
--     down-migration (dropping it loses the customization). Recover only via backup restore (if
--     approved) or a separately approved forward corrective migration.

-- CreateTable
CREATE TABLE "SportDefinitionOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'cmt4odhgn0000wokk8fbwr6ro',
    "sportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportDefinitionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportDefinitionOverride_organizationId_sportId_isActive_idx" ON "SportDefinitionOverride"("organizationId", "sportId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SportDefinitionOverride_organizationId_sportId_version_key" ON "SportDefinitionOverride"("organizationId", "sportId", "version");

-- AddForeignKey
ALTER TABLE "SportDefinitionOverride" ADD CONSTRAINT "SportDefinitionOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportDefinitionOverride" ADD CONSTRAINT "SportDefinitionOverride_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
