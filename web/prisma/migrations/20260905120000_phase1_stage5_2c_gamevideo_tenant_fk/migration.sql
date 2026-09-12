-- Phase 1, Stage 5.2C: tenant-aware composite foreign keys for the one live write path this
-- read-hardening stage discovered - registerGameVideoFromExistingAsset() (vision-loader.ts),
-- previously entirely unscoped, could attach a GameVideo to any organization's Fixture/
-- MediaAsset. This is the anchor relation for the whole G.21/G.22 vision domain: every other
-- vision model (VideoTimelineAnchor, VisionAnalysisRun, VisionObservation, VisionEventMatch,
-- CourtSpecification, VisionTrajectoryArtifact, VisionSpatialSummary) hangs off GameVideo, so
-- hardening GameVideo's own two direct relations is the highest-consequence, lowest-count
-- intervention available - the same "reference implementation, not exhaustive" approach every
-- prior stage since 5.4B has used, not a platform-wide rewrite of this domain's remaining
-- ~15 tenant-to-tenant relations (all left application-guard-only via this stage's
-- vision-loader.ts conversion, which resolves every id through a scoped tx first).
--
-- Hand-authored, mirroring the 5.4B/5.2B-3/5.2B-4 migrations exactly - no data transformation
-- needed (GameVideo has zero rows in production as of this stage - no real video has ever been
-- registered in this environment - so this migration cannot fail against existing data and
-- there was nothing to mismatch-audit beyond confirming that zero count).
--
-- Two parent tables gain `UNIQUE (organizationId, id)`: Fixture, MediaAsset.
--
--   GameVideo.fixtureId    -> Fixture(organizationId, id)     ON DELETE CASCADE  (required)
--   GameVideo.mediaAssetId -> MediaAsset(organizationId, id)  ON DELETE RESTRICT (required, 1:1)
--
-- GameVideo.mediaAssetId is a 1:1 relation (bare `@unique`) - Prisma requires the defining side
-- of a composite 1:1 relation to also expose the FK pair as its own unique constraint, so
-- GameVideo also gains `UNIQUE (organizationId, mediaAssetId)` - a mechanical requirement only;
-- mediaAssetId alone already guarantees the real 1:1 cardinality.
--
-- GameVideo.gameId (optional, ON DELETE SET NULL) is left as a simple FK - the same Prisma/
-- Postgres "composite FK + SET NULL on a column whose composite key includes a NOT NULL
-- organizationId" incompatibility Stage 5.2B-3 first documented.

ALTER TABLE "GameVideo" DROP CONSTRAINT "GameVideo_fixtureId_fkey";
ALTER TABLE "GameVideo" DROP CONSTRAINT "GameVideo_mediaAssetId_fkey";

CREATE UNIQUE INDEX "Fixture_organizationId_id_key" ON "Fixture"("organizationId", "id");
CREATE UNIQUE INDEX "MediaAsset_organizationId_id_key" ON "MediaAsset"("organizationId", "id");
CREATE UNIQUE INDEX "GameVideo_organizationId_mediaAssetId_key" ON "GameVideo"("organizationId", "mediaAssetId");

ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_organizationId_fixtureId_fkey" FOREIGN KEY ("organizationId", "fixtureId") REFERENCES "Fixture"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameVideo" ADD CONSTRAINT "GameVideo_organizationId_mediaAssetId_fkey" FOREIGN KEY ("organizationId", "mediaAssetId") REFERENCES "MediaAsset"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
