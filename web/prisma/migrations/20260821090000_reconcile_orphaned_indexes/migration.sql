-- G.22 Part III: Prisma/index drift audit. Deliberately separate from the G.22 vision migration
-- (Part III's own instruction: "Do NOT mix unrelated destructive cleanup into the G.22 vision
-- migration... create a separate forward-only migration").
--
-- Audited via a live `prisma migrate diff` against production before any G.22 schema work. Two
-- indexes exist in production with no corresponding @@index anywhere in the current
-- schema.prisma (confirmed by grep - only the underlying field declarations exist, no index
-- annotation). Classification: LEGACY/ORPHANED - some earlier track removed the @@index line
-- from schema.prisma without ever generating the matching DROP INDEX migration, leaving these
-- behind in the real database. Classification: SAFE_TO_RECONCILE - neither index is referenced
-- by any application code (grepped src/), and dropping an index changes no data and no query
-- correctness, only removes an unused query-planning hint that nothing declares an intent to
-- keep.
--
-- The other five differences the same audit found (RenameIndex on AthleteTrainingMetric and
-- DraftAllocation's long auto-generated constraint names) are classified EXPECTED, not
-- reconciled here: the underlying @@unique constraints are unchanged and still declared in
-- schema.prisma with identical columns - the name difference is purely a Prisma-version
-- truncation-algorithm artifact for identifiers exceeding Postgres's 63-character limit, with no
-- functional consequence either way. Left alone rather than churned for a cosmetic rename.

-- DropIndex
DROP INDEX "Application_type_status_coachSeasonZeroSelectionStatus_idx";

-- DropIndex
DROP INDEX "Club_brandingStatus_idx";
