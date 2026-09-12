-- Phase 1, Stage 5.4B: tenant-aware composite foreign keys for SeasonClub's season/club/division
-- relations - the relational-integrity layer underneath RLS's access-control layer.
--
-- Generated via the same live `prisma migrate diff --from-config-datasource --to-schema
-- <candidate>` method used for every prior migration in this project (this time against
-- ultraos_staging rather than production, since the composite-FK change needed a real database
-- to diff against before deciding on the exact DDL). The raw diff output also contained the
-- usual ~104 redundant `ALTER COLUMN "organizationId" SET DEFAULT` statements (the same
-- diff-tool artifact documented in Stage 3b's migration - comparing dbgenerated()'s string
-- representation against the introspected, explicitly-cast value) and a handful of cosmetic
-- RenameIndex statements (Prisma-version identifier-truncation drift, documented since Stage 0)
-- - both excluded here as always, since neither is a real change.
--
-- Why: Stage 5.2B-2's staging rehearsal proved a bare `FOREIGN KEY (clubId) REFERENCES Club(id)`
-- does not stop a cross-organization relationship - Postgres foreign key validation is not
-- subject to row-level security, so RLS making a cross-org Club invisible to a SELECT does
-- nothing to prevent its id being a valid FK target. This migration pairs organizationId into
-- each of SeasonClub's three tenant-to-tenant relations, so the constraint itself, not just RLS
-- or application-level scope validation, now requires the referenced Season/Club/Division to
-- belong to the same organization as the SeasonClub row referencing it.
--
-- Preceded by a production-safe, read-only audit (no mutation) of all 167 tenant-to-tenant
-- foreign key relations in the schema (every FK where both the child and parent table carry
-- organizationId): zero existing cross-org mismatches found in any of them, including these
-- three - this migration cannot fail against current data. The other 164 relations are
-- inventoried and classified but deliberately not converted in this migration - see
-- PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md for the full inventory and the reasoning for treating
-- this as a proven, incrementally-adopted pattern rather than a single platform-wide rewrite.
--
-- ON DELETE/ON UPDATE behavior is unchanged from the original single-column FKs: season stays
-- CASCADE (deleting a Season deletes its SeasonClub registrations), club and division stay
-- RESTRICT (a Club or Division with active SeasonClub registrations cannot be deleted).
--
-- Rehearsed on ultraos_staging as the actual restricted role, then separately inside a
-- rolled-back transaction as the privileged migrate role (which bypasses RLS entirely) to prove
-- this is a true database constraint, not something that only holds because of RLS: both
-- confirmed a cross-org Org-B-SeasonClub-referencing-Org-A-Club/Season attempt is rejected by
-- Postgres itself, regardless of which role or RLS context performs the write.

ALTER TABLE "SeasonClub" DROP CONSTRAINT "SeasonClub_clubId_fkey";
ALTER TABLE "SeasonClub" DROP CONSTRAINT "SeasonClub_divisionId_fkey";
ALTER TABLE "SeasonClub" DROP CONSTRAINT "SeasonClub_seasonId_fkey";

CREATE UNIQUE INDEX "Club_organizationId_id_key" ON "Club"("organizationId", "id");
CREATE UNIQUE INDEX "Division_organizationId_id_key" ON "Division"("organizationId", "id");
CREATE UNIQUE INDEX "Season_organizationId_id_key" ON "Season"("organizationId", "id");

ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_organizationId_seasonId_fkey" FOREIGN KEY ("organizationId", "seasonId") REFERENCES "Season"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_organizationId_clubId_fkey" FOREIGN KEY ("organizationId", "clubId") REFERENCES "Club"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeasonClub" ADD CONSTRAINT "SeasonClub_organizationId_divisionId_fkey" FOREIGN KEY ("organizationId", "divisionId") REFERENCES "Division"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
