-- External stats ingestion / tournament aggregation: adds COMPETITION to the existing global
-- bootstrap locator type from Stage 5.5A. Additive only - existing ATHLETE/CLUB/EVENT/FIXTURE/
-- MEDIA_ASSET locator rows and behavior are unaffected. Used by the new top-level [vanitySlug]
-- catch-all page (a short cross-organization tournament alias, e.g. /lbcl) - deliberately
-- separate from /t/[slug], which stays Neon-Ultra-only by design (see
-- resolveDefaultPublicOrganization's doc comment).
ALTER TYPE "PublicResourceLocatorType" ADD VALUE 'COMPETITION';
