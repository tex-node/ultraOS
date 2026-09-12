-- Phase 1, Stage 5.4A: make PublicIdCounter genuinely tenant-scoped, not merely RLS-compatible.
--
-- Hand-authored, not generated via `prisma migrate diff` - this migration restructures a primary
-- key (namespace -> id) while preserving the exact `nextValue` of every existing row, which is
-- not something the diff tool's straightforward ADD/DROP COLUMN output would get right without
-- manual sequencing.
--
-- Before: PublicIdCounter.namespace was the bare primary key - a single global sequence per
-- namespace shared by every organization, meaning two organizations' allocations would advance
-- the SAME counter and could interleave. organizationId existed as a column (added generically
-- in Stage 1) but played no role in allocation at all - it was decorative.
--
-- After: (organizationId, namespace) is the real per-tenant identity, backed by a genuine unique
-- constraint. `id` is a new, meaningless-by-itself scalar primary key, required only because
-- Prisma models need one. No existing nextValue is reset or renumbered - every existing row keeps
-- its exact current value (as of this writing: STAFF = 10, ATHLETE = 82, both Neon Ultra's), so
-- no existing ultraAthleteId/ultraStaffId is invalidated or can ever collide with a
-- freshly-allocated one.
--
-- Organization.idPrefixAthlete/idPrefixStaff become @unique: with allocation now tenant-local,
-- Athlete.ultraAthleteId/Staff.ultraStaffId's platform-wide uniqueness (both remain bare global
-- @unique - deliberately not made organizationId-composite, per Stage 3b's original reasoning,
-- unchanged by this migration) rests entirely on no two organizations ever sharing a prefix.
-- Enforced at the database level here, not just documented - a future organization-creation path
-- MUST assign a distinct prefix or this constraint correctly rejects it. Trivially safe today:
-- exactly one Organization row exists.
--
-- PublicIdCounter already has RLS enabled + forced with the standard tenant_isolation policy
-- (added in Stage 4a, applying to organizationId regardless of which column is the primary key) -
-- unaffected by this migration and not touched here.
--
-- Rehearsed on ultraos_staging as the actual restricted role before this ran against production:
-- confirmed the existing 2 rows' nextValue survived unchanged, confirmed a disposable second
-- organization allocates its own independent 1, 2, 3... sequence without advancing Neon Ultra's,
-- and confirmed concurrent same-organization allocations under the new unique constraint never
-- produce a duplicate value.

-- Add the new surrogate key column, nullable for now so the backfill below can run.
ALTER TABLE "PublicIdCounter" ADD COLUMN "id" TEXT;

-- Backfill every existing row with a real, unique value - gen_random_uuid() (built into Postgres
-- 13+ core, no extension required) rather than Prisma's cuid(), since this runs entirely in SQL,
-- not through the Prisma Client.
UPDATE "PublicIdCounter" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;

ALTER TABLE "PublicIdCounter" ALTER COLUMN "id" SET NOT NULL;

-- Replace the old bare-namespace primary key with the new surrogate key, then add the real
-- per-tenant unique constraint that is the actual point of this migration.
ALTER TABLE "PublicIdCounter" DROP CONSTRAINT "PublicIdCounter_pkey";
ALTER TABLE "PublicIdCounter" ADD CONSTRAINT "PublicIdCounter_pkey" PRIMARY KEY ("id");
ALTER TABLE "PublicIdCounter" ADD CONSTRAINT "PublicIdCounter_organizationId_namespace_key" UNIQUE ("organizationId", "namespace");

-- Enforce prefix distinctness across organizations at the database level.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_idPrefixAthlete_key" UNIQUE ("idPrefixAthlete");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_idPrefixStaff_key" UNIQUE ("idPrefixStaff");
