-- Phase 1, Stage 3b: Multi-Tenancy Foundation - unique constraint rewrites
--
-- Generated via the same live read-only `prisma migrate diff --from-config-datasource
-- --to-schema <candidate>` method used for every prior migration in this project. The raw diff
-- output also contained two categories of noise, both excluded here:
--   1. The usual 5 cosmetic RenameIndex statements (pre-existing Prisma identifier-truncation
--      drift, unrelated to this change).
--   2. 104 redundant `ALTER COLUMN "organizationId" SET DEFAULT` statements, one per tenant
--      table from Stage 3 - a genuine Prisma diff-tool artifact, not a real change. Verified
--      directly against the live column (`pg_get_expr` on `pg_attrdef`): the value already
--      stored is `'cmt4odhgn0000wokk8fbwr6ro'::text`, functionally identical to what
--      schema.prisma declares - Prisma's diff just compares the raw dbgenerated() string against
--      the introspected, explicitly-cast value and treats the `::text` suffix as a difference.
--      Applying these would be a no-op; excluded to keep this migration about what it's actually
--      about.
--
-- Six of the eight originally-inventoried unique-constraint fixes are included here (verified
-- via grep that no application code depends on the old bare/compound key for any of them):
--   Athlete.email, Club.name/shortName, Competition.name/slug (a gap found during this stage -
--   Competition had the identical @@unique([sportId, ...]) pattern as Club but was missed in
--   the original inventory), Vendor.name, NoveltyTeam.name, Venue.name+city.
--
-- Two were deliberately DEFERRED to Stage 5, not forgotten: Athlete.ultraAthleteId and
-- Staff.ultraStaffId both have real call sites (the public API's identifier lookup, several
-- admin pages) that assume a bare single-field unique lookup, and ultraAthleteId's uniqueness is
-- additionally still structurally guaranteed by the still-global PublicIdCounter (also deferred).
-- SystemSetting.key was also deferred - 15+ call sites across all-star-teams.ts,
-- application-intake.ts, broadcast-presentation-state.ts, game-day-checkin.ts, and others all
-- assume a bare unique lookup. See schema.prisma's doc comments on each for the full reasoning.

-- DropIndex
DROP INDEX "Athlete_email_key";

-- DropIndex
DROP INDEX "Club_sportId_name_key";

-- DropIndex
DROP INDEX "Club_sportId_shortName_key";

-- DropIndex
DROP INDEX "Competition_sportId_name_key";

-- DropIndex
DROP INDEX "Competition_sportId_slug_key";

-- DropIndex
DROP INDEX "NoveltyTeam_name_key";

-- DropIndex
DROP INDEX "Vendor_name_key";

-- DropIndex
DROP INDEX "Venue_name_city_key";

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_organizationId_email_key" ON "Athlete"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Club_organizationId_name_key" ON "Club"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Club_organizationId_shortName_key" ON "Club"("organizationId", "shortName");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_organizationId_name_key" ON "Competition"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_organizationId_slug_key" ON "Competition"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "NoveltyTeam_organizationId_name_key" ON "NoveltyTeam"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_organizationId_name_key" ON "Vendor"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_organizationId_name_city_key" ON "Venue"("organizationId", "name", "city");
