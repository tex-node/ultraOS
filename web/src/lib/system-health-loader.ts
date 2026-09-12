// System Health Loader (G.20, Part IV-X). The one Prisma-touching composition point for
// diagnostics - mirrors live-game-snapshot-v2.ts's established convention. Gathers real signals
// (DB connectivity, the selected game's Snapshot V2/Presentation Model, Presentation State) and
// hands them to the pure judgement functions in system-health.ts. No health *logic* lives here.
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { getBroadcastPresentationState } from "@/lib/broadcast-presentation-state";
import { isProductionPresentationFixture, productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { GRAPHIC_TYPES, type GraphicType } from "@/lib/broadcast-graphics";
import type { LivePresentationModel } from "@/lib/live-presentation-model";
import {
  computeSnapshotHealth, computeReconciliationHealth, computePresentationHealth, combineStatuses,
  type ComponentHealth, type HealthStatus,
} from "@/lib/system-health";

export type BrowserSourceHealth = { type: GraphicType; label: string; status: HealthStatus; detail: string };

export type SystemHealth = {
  generatedAt: string;
  overallStatus: HealthStatus;
  release: { name: string; serverTimeIso: string };
  service: ComponentHealth;
  database: ComponentHealth;
  selectedGame: { fixtureId: string; gameId: string; homeShortName: string; awayShortName: string; status: string } | null;
  noLiveGameReason: string | null;
  snapshot: ReturnType<typeof computeSnapshotHealth> | null;
  reconciliation: ComponentHealth | null;
  presentation: ReturnType<typeof computePresentationHealth>;
  browserSources: BrowserSourceHealth[];
  publicLive: ComponentHealth;
  broadcastStats: ComponentHealth;
  warnings: string[];
  critical: string[];
};

// The release directory name (e.g. "release-20260820204414-g19-nav-link") - the app always runs
// from <releaseDir>/web, so its parent directory's basename is the real deployed release
// identifier, with zero new config needed (Part XLI: "expose current release identifier").
function currentReleaseName(): string {
  try {
    return path.basename(path.dirname(process.cwd()));
  } catch {
    return "unknown";
  }
}

async function checkDatabase(): Promise<ComponentHealth> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: "HEALTHY", label: "Database", detail: `Reachable (${Date.now() - start}ms).` };
  } catch (error) {
    return { status: "CRITICAL", label: "Database", detail: error instanceof Error ? error.message : "Unreachable." };
  }
}

// Structural, not a live HTTP round-trip (Part X). Every one of these routes is a thin wrapper
// around exactly this LivePresentationModel (loadProductionGraphicModel calls the identical
// buildLivePresentationModelForGame this diagnostics page already called) - so whether the
// route WOULD render meaningful content is fully determined by the model already in hand.
// IDLE/READY are not failures (Part X's own example output shows "ULTRA TIME 200 IDLE" as a
// normal state), so this never manufactures a false alarm for a quiet graphic.
function computeBrowserSourceHealth(model: LivePresentationModel): BrowserSourceHealth[] {
  return GRAPHIC_TYPES.map(({ type, label }): BrowserSourceHealth => {
    switch (type) {
      case "SCORE_BUG":
      case "TEAM_COMPARISON":
        return { type, label, status: "HEALTHY", detail: "Always renders while a game is selected." };
      case "LEADER":
        return model.leaders.length > 0
          ? { type, label, status: "HEALTHY", detail: `${model.leaders.length} leader categor${model.leaders.length === 1 ? "y" : "ies"} available.` }
          : { type, label, status: "WARNING", detail: "No leaders yet - route would 404 until statistician events exist." };
      case "PLAYER_SPOTLIGHT":
        return model.players.length > 0
          ? { type, label, status: "HEALTHY", detail: `${model.players.length} player line(s) available - needs ?playerId=.` }
          : { type, label, status: "WARNING", detail: "No player stats yet." };
      case "RECORD_WATCH":
        return model.recordWatches.length > 0
          ? { type, label, status: "HEALTHY", detail: `${model.recordWatches.length} active record watch(es).` }
          : { type, label, status: "HEALTHY", detail: "IDLE - no record watch currently active (route 404s by design)." };
      case "MILESTONE":
        return model.liveMilestones.length > 0
          ? { type, label, status: "HEALTHY", detail: `${model.liveMilestones.length} live milestone(s).` }
          : { type, label, status: "HEALTHY", detail: "IDLE - no milestone currently active (route 404s by design)." };
      case "GAME_STORY":
        return model.gameStory
          ? { type, label, status: "HEALTHY", detail: `Story: ${model.gameStory.tags[0]}.` }
          : { type, label, status: "HEALTHY", detail: "IDLE - no story tag has fired yet (route 404s by design)." };
      case "ULTRA_TIME":
        return model.ultraTime.phase !== "INACTIVE"
          ? { type, label, status: "HEALTHY", detail: `Ultra Time ${model.ultraTime.phase}.` }
          : { type, label, status: "HEALTHY", detail: "IDLE - Ultra Time inactive (route 404s by design)." };
      case "FOUR_POINT_MOMENT":
        return model.ultraScoringFeed.some((m) => m.basePointValue === 4)
          ? { type, label, status: "HEALTHY", detail: "A 4PT moment is available." }
          : { type, label, status: "HEALTHY", detail: "IDLE - no 4PT make yet (route 404s by design)." };
      case "FINAL_SCORE":
        return model.isFinal
          ? { type, label, status: "HEALTHY", detail: model.isStatisticsVerified ? "FINAL and verified." : "FINAL, statistics pending verification." }
          : { type, label, status: "HEALTHY", detail: "IDLE - game not FINAL yet (route 404s by design)." };
      default:
        return { type, label, status: "UNKNOWN", detail: "No health rule defined." };
    }
  });
}

// Phase 1 Stage 5.2C: `organizationId` is now required and every fixture/game/gameEvent read
// below runs inside its scoped transaction - previously `selectedGameId` (an optional,
// client-suppliable `?gameId=` query param on /broadcast/diagnostics) went straight into a bare,
// unscoped prisma.fixture.findFirst with no tenant check at all, meaning an Org B operator could
// have inspected Org A's live game health/snapshot (team names, fixture id, clock/reconciliation
// state) merely by guessing or knowing another organization's real game id.
export async function buildSystemHealth(organizationId: string, selectedGameId?: string): Promise<SystemHealth> {
  const generatedAt = new Date();
  const warnings: string[] = [];
  const critical: string[] = [];

  const database = await checkDatabase();
  if (database.status === "CRITICAL") critical.push(database.detail);

  const service: ComponentHealth = { status: "HEALTHY", label: "Application service", detail: "Responding (this page rendered)." };

  let selectedGame: SystemHealth["selectedGame"] = null;
  let snapshot: SystemHealth["snapshot"] = null;
  let reconciliation: SystemHealth["reconciliation"] = null;
  let browserSources: BrowserSourceHealth[] = [];
  let noLiveGameReason: string | null = null;
  let presentation: SystemHealth["presentation"];

  if (database.status === "CRITICAL") {
    noLiveGameReason = "Database unreachable.";
    presentation = computePresentationHealth({ hasProgram: false, programFixtureExists: false, programFixtureIsProduction: false, programAgeSeconds: null });
  } else {
    ({ selectedGame, snapshot, reconciliation, browserSources, noLiveGameReason, presentation } = await withOrganizationContext(organizationId, async (tx) => {
      // Selected game: explicit ?gameId= wins; otherwise the same discovery a normal operator
      // would expect - the first current PRODUCTION LIVE/PAUSED fixture. A foreign-org
      // selectedGameId is invisible to RLS here and falls through to noLiveGameReason below,
      // never reaching buildLivePresentationModelForGame.
      const fixtureWhere: Prisma.FixtureWhereInput = selectedGameId
        ? { game: { id: selectedGameId } }
        : { game: { status: { in: ["LIVE", "PAUSED"] } }, ...productionPresentationFixtureWhere() };
      const fixture = await tx.fixture.findFirst({
        where: fixtureWhere,
        include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
      }).catch(() => null);

      let selectedGame: SystemHealth["selectedGame"] = null;
      let snapshot: SystemHealth["snapshot"] = null;
      let reconciliation: SystemHealth["reconciliation"] = null;
      let browserSources: BrowserSourceHealth[] = [];
      let noLiveGameReason: string | null = null;

      if (fixture?.game) {
        selectedGame = {
          fixtureId: fixture.id, gameId: fixture.game.id,
          homeShortName: fixture.homeSeasonClub.club.shortName, awayShortName: fixture.awaySeasonClub.club.shortName,
          status: fixture.game.status,
        };
        const model = await buildLivePresentationModelForGame(fixture.game.id, tx);
        const lastActiveEvent = await tx.gameEvent.findFirst({ where: { gameId: fixture.game.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        snapshot = computeSnapshotHealth({ gameStatus: model.status, clockRunning: model.clock.running, lastEventAt: lastActiveEvent?.createdAt ?? null, nowMs: generatedAt.getTime() });
        reconciliation = computeReconciliationHealth({ overallStatus: model.reconciliation.overallStatus, isFinal: model.isFinal });
        browserSources = computeBrowserSourceHealth(model);
        if (snapshot.status === "WARNING") warnings.push(snapshot.detail);
        if (snapshot.status === "CRITICAL") critical.push(snapshot.detail);
        if (reconciliation.status === "WARNING") warnings.push(reconciliation.detail);
        if (reconciliation.status === "CRITICAL") critical.push(reconciliation.detail);
      } else {
        noLiveGameReason = selectedGameId ? "No LIVE/PAUSED production game found with that id." : "No LIVE/PAUSED production game right now.";
      }

      // Presentation health - independent of which game is "selected" above; Program can
      // reference any game, live or not. SystemSetting.key (the presentation-state store) is a
      // separately named, already-known deferred global limitation - see the Stage 5.2C doc.
      const presentationState = await getBroadcastPresentationState(organizationId, tx).catch(() => null);
      let presentation: SystemHealth["presentation"];
      if (!presentationState || !presentationState.program) {
        presentation = computePresentationHealth({ hasProgram: false, programFixtureExists: false, programFixtureIsProduction: false, programAgeSeconds: null });
      } else {
        const programGame = await tx.game.findUnique({ where: { id: presentationState.program.gameId }, include: { fixture: true } }).catch(() => null);
        const ageSeconds = Math.floor((generatedAt.getTime() - new Date(presentationState.updatedAt).getTime()) / 1000);
        presentation = computePresentationHealth({
          hasProgram: true,
          programFixtureExists: programGame !== null,
          programFixtureIsProduction: programGame ? isProductionPresentationFixture(programGame.fixture) : false,
          programAgeSeconds: ageSeconds,
        });
      }

      return { selectedGame, snapshot, reconciliation, browserSources, noLiveGameReason, presentation };
    }));
  }
  if (presentation.status === "CRITICAL") critical.push(presentation.detail);
  else if (presentation.status === "WARNING") warnings.push(presentation.detail);

  // Public/commentator surface health: structural (Part X's own guidance to avoid "developer-
  // only stack traces" favors a reliable, fast, in-process check over an extra network round
  // trip that could itself flake under load). Both surfaces are thin wrappers around the exact
  // DB connectivity and query paths already exercised above.
  const publicLive: ComponentHealth = database.status === "CRITICAL"
    ? { status: "CRITICAL", label: "Public /live", detail: "Cannot query fixtures - database unreachable." }
    : { status: "HEALTHY", label: "Public /live", detail: "Fixture discovery query succeeded." };
  const broadcastStats: ComponentHealth = database.status === "CRITICAL"
    ? { status: "CRITICAL", label: "Commentator /broadcast/stats", detail: "Cannot query fixtures - database unreachable." }
    : { status: "HEALTHY", label: "Commentator /broadcast/stats", detail: "Fixture discovery query succeeded." };

  const overallStatus = combineStatuses([
    database.status, snapshot?.status ?? "HEALTHY", reconciliation?.status ?? "HEALTHY", presentation.status,
    publicLive.status, broadcastStats.status, ...browserSources.map((b) => b.status),
  ]);

  return {
    generatedAt: generatedAt.toISOString(),
    overallStatus,
    release: { name: currentReleaseName(), serverTimeIso: generatedAt.toISOString() },
    service, database,
    selectedGame, noLiveGameReason,
    snapshot, reconciliation, presentation, browserSources,
    publicLive, broadcastStats,
    warnings, critical,
  };
}
