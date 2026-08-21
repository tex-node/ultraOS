-- Authoritative club brand metadata for public, content, and Draft Day presentation surfaces.

ALTER TABLE "Club"
  ADD COLUMN "officialSlogan" TEXT,
  ADD COLUMN "crowdChant" TEXT,
  ADD COLUMN "identityKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
