// Phase 1, Stage 5.2C: two-tenant staging rehearsal for authenticated analytics/vision tenancy
// hardening. Genuine repeatable rehearsal utility, not a historical one-off (same category as
// draft-tenancy-isolation-integration-test.ts / vendor-event-reservation-tenancy-isolation-
// integration-test.ts) - run against `ultraos_staging` connected as the restricted
// `ultraos_staging` role so RLS is genuinely exercised, never against production.
//
// Builds a disposable Organization B AND a disposable Competition/Season under Neon Ultra
// itself (never touching any real Season Zero data - a brand-new seasonId scopes every
// analytics query below to only these rehearsal rows), each with one fixture/game carrying a
// deliberately distinctive SENTINEL point total, so cross-org contamination in any aggregate
// would be immediately obvious rather than masked by coincidentally-equal numbers.
import {
  AthleteGender, ClubBrandingStatus, ClubStatus, FixtureStatus, GameDataCapability, GameStatus,
  MediaAssetPurpose, MediaStorageProvider, RecordOrigin, SeasonClubStatus, SeasonStatus,
  StatDataSource, VideoSourceType,
} from "../src/generated/prisma/enums";
import { loadGameCore, loadSeasonGameCores, loadSeasonPlayerTotals } from "../src/lib/analytics/game-analytics";
import { recalculateStandings } from "../src/lib/standings";
import { getFixtureVisionWorkspaceData, getVisionDashboardData, listGameVideosForFixture, registerGameVideoFromExistingAsset } from "../src/lib/vision/vision-loader";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const NEON_ULTRA = "cmt4odhgn0000wokk8fbwr6ro";
const SENTINEL_A_POINTS = 991;
const SENTINEL_B_POINTS = 337;

function report(label: string, ok: boolean, extra?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${extra ? " -> " + extra : ""}`);
}

async function buildFixtureRig(orgId: string, tag: string, sportId: string, sentinelPoints: number) {
  return withOrganizationContext(orgId, async (tx) => {
    const competition = await tx.competition.create({ data: { organizationId: orgId, sportId, name: `${tag} League`, slug: `${tag.toLowerCase()}-league-${Date.now()}` } });
    const division = await tx.division.create({ data: { organizationId: orgId, competitionId: competition.id, name: `${tag} Division`, slug: `${tag.toLowerCase()}-division-${Date.now()}`, isActive: true } });
    const season = await tx.season.create({ data: { organizationId: orgId, competitionId: competition.id, name: `${tag} Season`, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: SeasonStatus.ACTIVE } });
    const venue = await tx.venue.create({ data: { organizationId: orgId, name: `${tag} Venue`, address: "1 Sentinel Way", city: "Lagos", capacity: 500 } });
    const homeClub = await tx.club.create({ data: { organizationId: orgId, sportId, name: `${tag} Home Club`, shortName: `${tag.slice(0, 3).toUpperCase()}H`, status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
    const awayClub = await tx.club.create({ data: { organizationId: orgId, sportId, name: `${tag} Away Club`, shortName: `${tag.slice(0, 3).toUpperCase()}A`, status: ClubStatus.ACTIVE, brandingStatus: ClubBrandingStatus.BRANDING_INCOMPLETE } });
    const homeSeasonClub = await tx.seasonClub.create({ data: { organizationId: orgId, seasonId: season.id, clubId: homeClub.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
    const awaySeasonClub = await tx.seasonClub.create({ data: { organizationId: orgId, seasonId: season.id, clubId: awayClub.id, divisionId: division.id, status: SeasonClubStatus.ACTIVE } });
    const fixture = await tx.fixture.create({
      data: {
        organizationId: orgId, seasonId: season.id, divisionId: division.id,
        homeSeasonClubId: homeSeasonClub.id, awaySeasonClubId: awaySeasonClub.id,
        scheduledAt: new Date("2026-06-01T18:00:00Z"), venueId: venue.id, status: FixtureStatus.FINAL,
        homeScore: sentinelPoints, awayScore: 10, winnerSeasonClubId: homeSeasonClub.id,
        recordOrigin: RecordOrigin.PRODUCTION,
      },
    });
    const game = await tx.game.create({
      data: {
        organizationId: orgId, fixtureId: fixture.id, status: GameStatus.FINAL,
        dataCapability: GameDataCapability.BOX_SCORE_ONLY, statSource: StatDataSource.CSV_IMPORT,
        startedAt: new Date("2026-06-01T18:00:00Z"), endedAt: new Date("2026-06-01T20:00:00Z"),
      },
    });
    const user = await prisma.user.create({ data: { email: `sentinel-${tag.toLowerCase()}-${Date.now()}@example.test`, name: `Sentinel ${tag}`, role: "FAN" } });
    const athlete = await tx.athlete.create({ data: { organizationId: orgId, userId: user.id, firstName: "Sentinel", lastName: tag, gender: AthleteGender.MALE, dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT", recordOrigin: RecordOrigin.APPLICATION } });
    const player = await tx.player.create({ data: { organizationId: orgId, athleteId: athlete.id, seasonId: season.id, seasonClubId: homeSeasonClub.id, position: "Guard", heightCm: 190, weightKg: 85, jerseyNumber: 7 } });
    await tx.playerStat.create({ data: { organizationId: orgId, gameId: game.id, playerId: player.id, seasonClubId: homeSeasonClub.id, points: sentinelPoints, rebounds: 3, assists: 2, statSource: StatDataSource.CSV_IMPORT } });
    await tx.teamStat.create({ data: { organizationId: orgId, gameId: game.id, seasonClubId: homeSeasonClub.id, points: sentinelPoints, rebounds: 20, assists: 15 } });
    await tx.teamStat.create({ data: { organizationId: orgId, gameId: game.id, seasonClubId: awaySeasonClub.id, points: 10, rebounds: 12, assists: 4 } });
    await tx.standing.create({ data: { organizationId: orgId, seasonId: season.id, seasonClubId: homeSeasonClub.id, played: 1, won: 1, pointsFor: sentinelPoints, pointsAgainst: 10, pointDifference: sentinelPoints - 10, leaguePoints: 3 } });
    await tx.standing.create({ data: { organizationId: orgId, seasonId: season.id, seasonClubId: awaySeasonClub.id, played: 1, lost: 1, pointsFor: 10, pointsAgainst: sentinelPoints, pointDifference: 10 - sentinelPoints, leaguePoints: 0 } });
    return { competition, division, season, venue, homeClub, awayClub, homeSeasonClub, awaySeasonClub, fixture, game, user, athlete, player };
  });
}

async function buildGameVideoRig(orgId: string, tag: string, rig: Awaited<ReturnType<typeof buildFixtureRig>>) {
  return withOrganizationContext(orgId, async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        organizationId: orgId, storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE,
        objectKey: `sentinel/${tag.toLowerCase()}-${Date.now()}.mp4`, mimeType: "video/mp4", byteSize: 1024,
        checksumSha256: `sentinel-${tag}-${Date.now()}`, purpose: MediaAssetPurpose.GAME_VIDEO, uploadedById: rig.user.id,
      },
    });
    const video = await tx.gameVideo.create({
      data: { organizationId: orgId, fixtureId: rig.fixture.id, gameId: rig.game.id, mediaAssetId: asset.id, sourceType: VideoSourceType.FULL_GAME, registeredById: rig.user.id },
    });
    return { asset, video };
  });
}

async function cleanup(orgId: string, rig: Awaited<ReturnType<typeof buildFixtureRig>>, video?: { asset: { id: string }; video: { id: string } }) {
  await withOrganizationContext(orgId, async (tx) => {
    if (video) {
      await tx.gameVideo.deleteMany({ where: { id: video.video.id } });
      await tx.mediaAsset.deleteMany({ where: { id: video.asset.id } });
    }
    await tx.playerStat.deleteMany({ where: { gameId: rig.game.id } });
    await tx.teamStat.deleteMany({ where: { gameId: rig.game.id } });
    await tx.standing.deleteMany({ where: { seasonId: rig.season.id } });
    await tx.player.deleteMany({ where: { id: rig.player.id } });
    await tx.athlete.deleteMany({ where: { id: rig.athlete.id } });
    await tx.game.deleteMany({ where: { id: rig.game.id } });
    await tx.fixture.deleteMany({ where: { id: rig.fixture.id } });
    await tx.seasonClub.deleteMany({ where: { seasonId: rig.season.id } });
    await tx.club.deleteMany({ where: { id: { in: [rig.homeClub.id, rig.awayClub.id] } } });
    await tx.venue.deleteMany({ where: { id: rig.venue.id } });
    await tx.season.deleteMany({ where: { id: rig.season.id } });
    await tx.division.deleteMany({ where: { id: rig.division.id } });
    await tx.competition.deleteMany({ where: { id: rig.competition.id } });
  });
  await prisma.user.deleteMany({ where: { id: rig.user.id } });
}

async function main() {
  const sport = await withOrganizationContext(NEON_ULTRA, (tx) => tx.sport.findFirstOrThrow());
  const orgB = await prisma.organization.create({ data: { name: "Analytics Sentinel League B", slug: `analytics-sentinel-b-${Date.now()}`, idPrefixAthlete: `AB${Date.now() % 10000}`, idPrefixStaff: `SB${Date.now() % 10000}` } });
  console.log("Created disposable Organization B:", orgB.id);

  console.log("\n========== Building disposable sentinel fixtures (Org A: 991 pts, Org B: 337 pts) ==========");
  const rigA = await buildFixtureRig(NEON_ULTRA, "SentinelA", sport.id, SENTINEL_A_POINTS);
  const rigB = await buildFixtureRig(orgB.id, "SentinelB", sport.id, SENTINEL_B_POINTS);
  report("Disposable Org A and Org B sentinel fixtures created", Boolean(rigA.fixture.id && rigB.fixture.id));

  console.log("\n========== ANALYTICS: player/team totals, standings, game core isolation ==========");
  await withOrganizationContext(orgB.id, async (tx) => {
    const playerTotals = await loadSeasonPlayerTotals(rigB.season.id, tx);
    const points = playerTotals.find((p) => p.playerId === rigB.player.id)?.points;
    report("Org B loadSeasonPlayerTotals returns Org B's own sentinel (337), not Org A's (991)", points === SENTINEL_B_POINTS, `got ${points}`);

    const games = await loadSeasonGameCores(rigB.season.id, tx);
    report("Org B loadSeasonGameCores(Org B seasonId) returns exactly Org B's 1 disposable game", games.length === 1 && games[0]?.home.score === SENTINEL_B_POINTS, `count=${games.length}`);

    // Standings: run the REAL recalculateStandings against Org B's own disposable season -
    // proves the real computation path, not calculateStandings() in isolation.
    await recalculateStandings(tx, orgB.id, rigB.season.id);
    const standings = await tx.standing.findMany({ where: { seasonId: rigB.season.id } });
    const homeStanding = standings.find((s) => s.seasonClubId === rigB.homeSeasonClub.id);
    report("Org B recalculateStandings recomputes Org B's own standing correctly (won=1, pointsFor=337)", homeStanding?.won === 1 && homeStanding?.pointsFor === SENTINEL_B_POINTS, JSON.stringify(homeStanding));

    // Cross-org denial: Org A's real gameId, under Org B's own tx.
    const crossOrgGame = await loadGameCore(rigA.game.id, tx);
    report("Org B loadGameCore(Org A's real gameId) DENIED (RLS -> null)", crossOrgGame === null);
  });

  await withOrganizationContext(NEON_ULTRA, async (tx) => {
    const playerTotals = await loadSeasonPlayerTotals(rigA.season.id, tx);
    const points = playerTotals.find((p) => p.playerId === rigA.player.id)?.points;
    report("Org A loadSeasonPlayerTotals (own disposable season) returns Org A's own sentinel (991), not Org B's (337)", points === SENTINEL_A_POINTS, `got ${points}`);
    const crossOrgGame = await loadGameCore(rigB.game.id, tx);
    report("Org A loadGameCore(Org B's real gameId) DENIED (RLS -> null)", crossOrgGame === null);
  });

  console.log("\n========== READINESS: Org A/B dashboard-style standing-integrity checks don't cross-contaminate ==========");
  await withOrganizationContext(orgB.id, async (tx) => {
    const teams = await tx.seasonClub.findMany({ where: { seasonId: rigB.season.id }, select: { id: true } });
    report("Org B readiness team scan sees exactly its own 2 SeasonClubs, not Org A's", teams.length === 2, `count=${teams.length}`);
  });
  await withOrganizationContext(NEON_ULTRA, async (tx) => {
    const teams = await tx.seasonClub.findMany({ where: { seasonId: rigA.season.id }, select: { id: true } });
    report("Org A readiness team scan sees exactly its own 2 SeasonClubs, not Org B's", teams.length === 2, `count=${teams.length}`);
  });

  console.log("\n========== VISION: GameVideo/workspace isolation + composite FK denial ==========");
  const videoA = await buildGameVideoRig(NEON_ULTRA, "SentinelA", rigA);
  const videoB = await buildGameVideoRig(orgB.id, "SentinelB", rigB);
  report("Disposable Org A and Org B GameVideo rows created", Boolean(videoA.video.id && videoB.video.id));

  // A second, deliberately UNATTACHED Org A MediaAsset (mediaAssetId is a bare global @unique -
  // reusing videoA.asset.id, which already has its own GameVideo, would trip that unique
  // constraint before the composite FK is ever reached, exactly the same pitfall as reusing a
  // mediaAssetId on the Org B side above).
  const spareOrgAAsset = await withOrganizationContext(NEON_ULTRA, (tx) => tx.mediaAsset.create({
    data: { organizationId: NEON_ULTRA, storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, objectKey: `sentinel/spare-org-a-asset-${Date.now()}.mp4`, mimeType: "video/mp4", byteSize: 1024, checksumSha256: `spare-org-a-asset-${Date.now()}`, purpose: MediaAssetPurpose.GAME_VIDEO, uploadedById: rigA.user.id },
  }));

  await withOrganizationContext(orgB.id, async () => {
    const dashboard = await getVisionDashboardData(orgB.id);
    const sawOrgA = dashboard.videos.some((v) => v.id === videoA.video.id);
    const sawOrgB = dashboard.videos.some((v) => v.id === videoB.video.id);
    report("Org B vision dashboard excludes Org A's GameVideo and includes its own", !sawOrgA && sawOrgB, `sawOrgA=${sawOrgA} sawOrgB=${sawOrgB}`);

    const listForOrgAFixture = await listGameVideosForFixture(orgB.id, rigA.fixture.id);
    report("Org B listGameVideosForFixture(Org A's real fixtureId) returns empty (RLS)", listForOrgAFixture.length === 0, `count=${listForOrgAFixture.length}`);

    const workspaceForOrgAFixture = await getFixtureVisionWorkspaceData(orgB.id, rigA.fixture.id, null);
    report("Org B getFixtureVisionWorkspaceData(Org A's real fixtureId) returns no video (RLS)", workspaceForOrgAFixture.selected === null);
  });

  // Each negative test below runs in its OWN withOrganizationContext transaction - a failed
  // statement aborts the whole Postgres transaction (25P02), so bundling multiple deliberately-
  // failing attempts into one shared tx would poison every attempt after the first.

  // Direct composite-FK denial: Org B's own (freshly minted, not reused) mediaAsset, but Org
  // A's real fixtureId. A raw tx.gameVideo.create() bypasses registerGameVideoFromExistingAsset()'s
  // own app-level scoped-lookup guard entirely, so a rejection here can only come from the
  // composite FK itself, not that guard.
  try {
    await withOrganizationContext(orgB.id, async (tx) => {
      const spareAsset = await tx.mediaAsset.create({
        data: { organizationId: orgB.id, storageProvider: MediaStorageProvider.LOCAL_PERSISTENT_STORAGE, objectKey: `sentinel/spare-fixture-test-${Date.now()}.mp4`, mimeType: "video/mp4", byteSize: 1024, checksumSha256: `spare-fixture-test-${Date.now()}`, purpose: MediaAssetPurpose.GAME_VIDEO, uploadedById: rigB.user.id },
      });
      await tx.gameVideo.create({ data: { organizationId: orgB.id, fixtureId: rigA.fixture.id, mediaAssetId: spareAsset.id, sourceType: VideoSourceType.FULL_GAME, registeredById: rigB.user.id } });
    });
    report("Org B GameVideo -> Org A Fixture denied (composite FK)", false, "create succeeded unexpectedly");
  } catch (error) {
    report("Org B GameVideo -> Org A Fixture denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
  }
  // The spare mediaAsset above lived only inside the aborted transaction - nothing to clean up.

  // Direct composite-FK denial: Org B's own fixture (fixtureId has no uniqueness constraint,
  // safe to reuse), but Org A's real mediaAssetId. Raw create again, not through
  // registerGameVideoFromExistingAsset(), for the same isolation-from-the-app-guard reason.
  try {
    await withOrganizationContext(orgB.id, (tx) => tx.gameVideo.create({ data: { organizationId: orgB.id, fixtureId: rigB.fixture.id, mediaAssetId: spareOrgAAsset.id, sourceType: VideoSourceType.FULL_GAME, registeredById: rigB.user.id } }));
    report("Org B GameVideo -> Org A MediaAsset denied (composite FK)", false, "create succeeded unexpectedly");
  } catch (error) {
    report("Org B GameVideo -> Org A MediaAsset denied (composite FK)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
  }

  // The application-level guard is real too, and worth proving separately: registerGame-
  // VideoFromExistingAsset()'s own scoped findUniqueOrThrow rejects Org A's mediaAssetId before
  // ever reaching the create - a distinct layer from the composite FK just proven.
  try {
    await registerGameVideoFromExistingAsset(orgB.id, { fixtureId: rigB.fixture.id, gameId: null, mediaAssetId: spareOrgAAsset.id, sourceType: VideoSourceType.FULL_GAME, cameraLabel: null, recordingStartedAt: null, registeredById: rigB.user.id });
    report("Org B registerGameVideoFromExistingAsset(Org A's real mediaAssetId) denied (application-level scoped lookup)", false, "call succeeded unexpectedly");
  } catch (error) {
    report("Org B registerGameVideoFromExistingAsset(Org A's real mediaAssetId) denied (application-level scoped lookup)", true, error instanceof Error ? error.message.split("\n").pop() : String(error));
  }

  const residualCrossOrgVideos = await withOrganizationContext(orgB.id, (tx) => tx.gameVideo.count({ where: { organizationId: orgB.id, id: { notIn: [videoB.video.id] } } }));
  report("Zero partial writes after failed cross-org GameVideo attempts", residualCrossOrgVideos === 0);

  console.log("\n========== CLEANUP ==========");
  await withOrganizationContext(orgB.id, (tx) => tx.gameVideo.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(orgB.id, (tx) => tx.mediaAsset.deleteMany({ where: { organizationId: orgB.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.gameVideo.deleteMany({ where: { id: videoA.video.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.mediaAsset.deleteMany({ where: { id: videoA.asset.id } }));
  await withOrganizationContext(NEON_ULTRA, (tx) => tx.mediaAsset.deleteMany({ where: { id: spareOrgAAsset.id } }));
  await cleanup(orgB.id, rigB);
  await cleanup(NEON_ULTRA, rigA);
  await prisma.organization.delete({ where: { id: orgB.id } });
  console.log("Cleanup complete - Organization B and every rehearsal row removed.");
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
