// G.20 Full Production Operations Rehearsal (Part XLVII-LVI). Builds on the exact write helpers
// g18/g19-rehearsal.ts already proved out (cannot authenticate via browser - entering a password
// is prohibited regardless of authorization). New this track: diagnostics rehearsal (healthy ->
// mismatch -> resolved), a real stale-data simulation (backdated event timestamp, not just the
// pure-function unit tests), Program-failure safety, service restart with multiple consumers
// active (diagnostics + public API v1 + a browser source), finalization, and one post-final
// correction with propagation checked through the NEW public API surface too.
import { prisma } from "../src/lib/prisma";
import { effectiveRuleSnapshot, scoreShot } from "../src/lib/ultra-scoring-engine";
import { buildLivePresentationModelForGame } from "../src/lib/live-game-snapshot-v2";
import { buildSystemHealth } from "../src/lib/system-health-loader";
import { recalculateStandings } from "../src/lib/standings";
import { setPreview, takeToProgram, clearProgram, getBroadcastPresentationState } from "../src/lib/broadcast-presentation-state";
import { derivePlayerStats, deriveTeamStats, emptyPlayerStats, emptyTeamStats, type DerivableEvent } from "../src/lib/event-derived-stats";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;
const SCORER_SOURCE = "ULTRA_NATIVE_LIVE_SCORER" as const;
const HOST = "http://127.0.0.1:4110";

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== G.20 Full Production Operations Rehearsal: start ===");
  const preFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  const preStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const preResidue = await prisma.fixture.count({ where: { recordOrigin: "REHEARSAL" } });
  ok("No leftover rehearsal residue before this run", preResidue === 0, { preResidue });

  // --- Diagnostics rehearsal, part 1: HEALTHY with nothing live ---
  const idleHealth = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro");
  ok("Diagnostics reports overall HEALTHY with no live game and no residue", idleHealth.overallStatus === "HEALTHY", idleHealth.overallStatus);
  ok("Diagnostics correctly reports no live game rather than fabricating one", idleHealth.selectedGame === null);

  const clubs = await prisma.seasonClub.findMany({ where: { seasonId: SEASON_ID }, include: { club: true, players: { include: { athlete: true }, take: 6 } }, take: 2 });
  const [home, away] = clubs;
  const hp = home.players, ap = away.players;

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: { seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId, homeSeasonClubId: home.id, awaySeasonClubId: away.id, scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL" },
  });
  let game = await prisma.game.create({
    data: { fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, clockStartedAt: new Date(), startedAt: new Date(), statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS" },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created (LIVE, clock running).`);

  await prisma.gameStarter.createMany({ data: hp.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: home.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  await prisma.gameStarter.createMany({ data: ap.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: away.id, playerId: p.id, confirmedById: ACTOR_ID })) });

  async function scorerScore(seasonClubId: string, playerId: string, shotValue: number, period: number, clockSeconds: number, createdAt?: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true, ruleSnapshot: true } });
      const shot = scoreShot({ rules: effectiveRuleSnapshot(g.ruleSnapshot), shotValue, gameStatus: g.status, currentPeriod: period, remainingClockSeconds: clockSeconds });
      if (!shot.valid) throw new Error(shot.error);
      const isHome = seasonClubId === g.fixture.homeSeasonClubId;
      const currentScore = isHome ? g.fixture.homeScore : g.fixture.awayScore;
      const nextScore = currentScore + shot.pointsAwarded;
      await tx.fixture.update({ where: { id: fixture.id }, data: isHome ? { homeScore: nextScore } : { awayScore: nextScore } });
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: "SCORE", points: shot.pointsAwarded, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made: true, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal scorer ${shotValue}PT`, sequenceNumber, source: SCORER_SOURCE, createdById: ACTOR_ID, createdAt, homeScoreBefore: isHome ? currentScore : g.fixture.homeScore, awayScoreBefore: isHome ? g.fixture.awayScore : currentScore, homeScoreAfter: isHome ? nextScore : g.fixture.homeScore, awayScoreAfter: isHome ? g.fixture.awayScore : nextScore } });
    });
  }
  async function statShot(seasonClubId: string, playerId: string, shotValue: number, made: boolean, period: number, clockSeconds: number, createdAt?: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { ruleSnapshot: true } });
      const shot = scoreShot({ rules: effectiveRuleSnapshot(g.ruleSnapshot), shotValue, gameStatus: g.status, currentPeriod: period, remainingClockSeconds: clockSeconds });
      if (!shot.valid) throw new Error(shot.error);
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: shotValue === 1 ? (made ? "FREE_THROW_MADE" : "FREE_THROW_MISSED") : (made ? "SHOT_MADE" : "SHOT_MISSED"), points: made ? shot.pointsAwarded : 0, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal statistician ${shotValue}PT ${made ? "MADE" : "MISS"}`, sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID, createdAt } });
    });
  }

  // --- Rehearsal Event Set (Part XLVIII): starting five (done above), 2PT, 3PT, 4PT, misses,
  // rebound/assist/turnover/foul, substitution, lead change, Ultra Time, 3PT x2, 4PT x2,
  // milestone, provisional record. ---
  await scorerScore(home.id, hp[0].id, 2, 1, 500); await statShot(home.id, hp[0].id, 2, true, 1, 500);
  await scorerScore(away.id, ap[0].id, 3, 1, 480); await statShot(away.id, ap[0].id, 3, true, 1, 480); // lead change
  await statShot(home.id, hp[1].id, 2, false, 1, 460); // miss, statistician only
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: home.id, playerId: hp[1].id, eventType: "OFFENSIVE_REBOUND", period: 1, clockSeconds: 455, description: "Rehearsal rebound", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: home.id, playerId: hp[2].id, eventType: "ASSIST", period: 1, clockSeconds: 450, description: "Rehearsal assist", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: away.id, playerId: ap[1].id, eventType: "TURNOVER", period: 1, clockSeconds: 445, description: "Rehearsal turnover", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: away.id, playerId: ap[2].id, eventType: "FOUL", period: 1, clockSeconds: 440, description: "Rehearsal foul", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: home.id, playerId: hp[5]?.id ?? hp[4].id, substitutedOutPlayerId: hp[4].id, eventType: "SUBSTITUTION", period: 1, clockSeconds: 400, description: "Rehearsal sub", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  await scorerScore(home.id, hp[0].id, 2, 1, 390); await statShot(home.id, hp[0].id, 2, true, 1, 390); // home retakes lead

  // Ultra Time: 4PT x2 and a normal shot x2
  game = await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 50, clockStartedAt: new Date() } });
  await scorerScore(home.id, hp[0].id, 4, 2, 50); await statShot(home.id, hp[0].id, 4, true, 2, 50);
  await scorerScore(home.id, hp[0].id, 2, 2, 40); await statShot(home.id, hp[0].id, 2, true, 2, 40);

  const modelDuringGame = await buildLivePresentationModelForGame(game.id);
  ok("Ultra Time active, 4PT captured, milestone/record-watch present (full event set landed)", modelDuringGame.ultraTime.phase === "ACTIVE" && modelDuringGame.fourPoint.home?.made === 1 && modelDuringGame.liveMilestones.length > 0);

  // --- Diagnostics rehearsal, part 2: this LIVE rehearsal game must never appear as the
  // "selected" game in normal diagnostics (it discovers PRODUCTION games only) ---
  const healthDuringRehearsal = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro");
  ok("Diagnostics (default discovery) does not pick up the REHEARSAL game", healthDuringRehearsal.selectedGame === null || healthDuringRehearsal.selectedGame.gameId !== game.id);
  // But explicit ?gameId= inspection (an operator debugging a specific id) still works - useful,
  // and does not itself leak the game onto any public surface.
  const healthWithExplicitGameId = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro", game.id);
  ok("Diagnostics CAN inspect the rehearsal game explicitly by id (operator debugging), reporting HEALTHY snapshot freshness", healthWithExplicitGameId.selectedGame?.gameId === game.id && healthWithExplicitGameId.snapshot?.status === "HEALTHY");

  // --- Stale-data rehearsal (Part L): a real backdated event, not just the pure-function test.
  // Uses its own fixture/game (not the scorerScore/statShot closures above, which are bound to
  // the main rehearsal `game`/`fixture` variables) - a direct GameEvent insert is sufficient
  // here since this only needs to exist and carry an old createdAt, not pass shot validation. ---
  const staleFixture = await prisma.fixture.create({ data: { seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId, homeSeasonClubId: home.id, awaySeasonClubId: away.id, scheduledAt: new Date(Date.now() + 366 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL" } });
  const staleGame = await prisma.game.create({
    data: { fixtureId: staleFixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, clockStartedAt: new Date(), startedAt: new Date(), statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS" },
  });
  await prisma.gameEvent.create({
    data: { gameId: staleGame.id, seasonClubId: home.id, playerId: hp[0].id, eventType: "SCORE", points: 2, basePointValue: 2, multiplier: 1, made: true, period: 1, clockSeconds: 500, description: "Rehearsal stale-data test event", sequenceNumber: 1, source: SCORER_SOURCE, createdById: ACTOR_ID, createdAt: new Date(Date.now() - 200_000) },
  });
  const staleHealth = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro", staleGame.id);
  ok("Stale-data rehearsal: a genuinely 200s-old event while LIVE with the clock running reports CRITICAL/STALE", staleHealth.snapshot?.status === "CRITICAL" && staleHealth.snapshot?.freshness === "STALE", staleHealth.snapshot);
  await prisma.gameEvent.deleteMany({ where: { gameId: staleGame.id } });
  await prisma.game.delete({ where: { id: staleGame.id } });
  await prisma.fixture.delete({ where: { id: staleFixture.id } });

  // --- Score reconciliation mismatch rehearsal (Part XLIX): introduce a real mismatch, confirm
  // diagnostics surfaces it, resolve it, confirm it clears - never auto-corrected. ---
  await prisma.fixture.update({ where: { id: fixture.id }, data: { homeScore: { increment: 100 } } }); // official score now disagrees with the statistician's derived total
  const mismatchHealth = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro", game.id);
  ok("Diagnostics rehearsal: an introduced score mismatch is surfaced as WARNING (game still LIVE), never silently corrected", mismatchHealth.reconciliation?.status === "WARNING", mismatchHealth.reconciliation);
  await prisma.fixture.update({ where: { id: fixture.id }, data: { homeScore: { decrement: 100 } } }); // resolve
  const resolvedHealth = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro", game.id);
  ok("Diagnostics rehearsal: resolving the mismatch returns reconciliation to HEALTHY", resolvedHealth.reconciliation?.status === "HEALTHY");

  // --- Program-failure rehearsal (Part LI): Program pointing at this REHEARSAL game must never
  // crash diagnostics or the browser-source route - it must be diagnosed clearly. ---
  await setPreview({ gameId: game.id, graphicType: "SCORE_BUG", subjectId: null }, ACTOR_ID, ORGANIZATION_ID);
  await takeToProgram(ACTOR_ID, ORGANIZATION_ID);
  const healthWithInvalidProgram = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro");
  ok("Program-failure rehearsal: Program pointing at a REHEARSAL game is diagnosed as CRITICAL, not a crash", healthWithInvalidProgram.presentation.status === "CRITICAL", healthWithInvalidProgram.presentation);
  const scorebugWithInvalidProgram = await fetch(`${HOST}/broadcast/game/${game.id}/scorebug`);
  ok("Program-failure rehearsal: the browser source itself still 404s cleanly rather than crashing", scorebugWithInvalidProgram.status === 404);
  const programApiWithInvalidProgram = await fetch(`${HOST}/api/broadcast/program`).then((r) => r.json());
  ok("Program-failure rehearsal: the public Program API reports null rather than leaking the rehearsal game", programApiWithInvalidProgram.program === null);
  await clearProgram(ACTOR_ID, ORGANIZATION_ID);
  await setPreview(null, ACTOR_ID, ORGANIZATION_ID);

  // --- Public API isolation (new G.20 surface, same discipline as every graphics route) ---
  const publicGameApi = await fetch(`${HOST}/api/v1/games/${fixture.id}`);
  ok("Public API v1 refuses to serve the REHEARSAL game by its real fixture id (GAME_NOT_FOUND, not distinguished from nonexistent)", publicGameApi.status === 404);
  const publicLiveApi = await fetch(`${HOST}/api/v1/live`).then((r) => r.json());
  ok("Public API v1 /live does not list the REHEARSAL game", !publicLiveApi.games.some((g: { fixtureId: string }) => g.fixtureId === fixture.id));

  // --- Multi-consumer load during REHEARSAL LIVE state (Part XXXII) ---
  const consumerRequests: Promise<Response>[] = [];
  for (let i = 0; i < 20; i++) consumerRequests.push(fetch(`${HOST}/api/v1/live`));
  for (let i = 0; i < 5; i++) consumerRequests.push(fetch(`${HOST}/api/broadcast/program`));
  consumerRequests.push(fetch(`${HOST}/broadcast/diagnostics`).catch(() => new Response(null, { status: 599 }))); // authenticated - expect a redirect, not a crash
  const consumerResults = await Promise.all(consumerRequests);
  const consumerErrors = consumerResults.filter((r) => r.status >= 500);
  ok("Multi-consumer load (26 concurrent requests: 20 public /live + 5 program API + 1 diagnostics) produced zero 5xx errors", consumerErrors.length === 0, { errorCount: consumerErrors.length });

  // --- Finalize, verify, then a post-final correction with propagation across the public API ---
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
    const winnerSeasonClubId = g.fixture.homeScore > g.fixture.awayScore ? g.fixture.homeSeasonClubId : g.fixture.awaySeasonClubId;
    await tx.fixture.update({ where: { id: fixture.id }, data: { status: "FINAL", winnerSeasonClubId } });
    await tx.game.update({ where: { id: game.id }, data: { status: "FINAL", endedAt: new Date(), clockStartedAt: null } });
  });

  async function materialize() {
    return prisma.$transaction(async (tx) => {
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
      const [everyPlayer, activeEvents] = await Promise.all([
        tx.gameEvent.findMany({ where: { gameId: game.id, source: STAT_SOURCE, playerId: { not: null } }, distinct: ["playerId"], select: { playerId: true, seasonClubId: true } }),
        tx.gameEvent.findMany({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true } }) as Promise<DerivableEvent[]>,
      ]);
      const derivedPlayers = derivePlayerStats(activeEvents);
      for (const { playerId, seasonClubId } of everyPlayer) {
        if (!playerId || !seasonClubId) continue;
        const p = derivedPlayers.get(playerId) ?? emptyPlayerStats(playerId, seasonClubId);
        await tx.playerStat.upsert({ where: { gameId_playerId: { gameId: game.id, playerId } }, create: { gameId: game.id, playerId, seasonClubId: p.seasonClubId, points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" }, update: { points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" } });
      }
      const derivedTeams = deriveTeamStats(derivedPlayers);
      for (const seasonClubId of [g.fixture.homeSeasonClubId, g.fixture.awaySeasonClubId]) {
        const t = derivedTeams.get(seasonClubId) ?? emptyTeamStats(seasonClubId);
        await tx.teamStat.upsert({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId } }, create: { gameId: game.id, seasonClubId, points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" }, update: { points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" } });
      }
      await tx.game.update({ where: { id: game.id }, data: { statisticsVerifiedAt: new Date(), statisticsVerifiedById: ACTOR_ID } });
    });
  }
  await materialize();
  const modelAfterVerify = await buildLivePresentationModelForGame(game.id);
  ok("Finalization: FINAL and statistics verified", modelAfterVerify.isFinal && modelAfterVerify.isStatisticsVerified);

  // Public API reflects FINAL + verified immediately (isolation still holds for a FINAL rehearsal fixture - still GAME_NOT_FOUND)
  const publicApiAfterFinal = await fetch(`${HOST}/api/v1/games/${fixture.id}`);
  ok("Public API v1 still refuses a FINAL REHEARSAL fixture (isolation isn't just a LIVE-state check)", publicApiAfterFinal.status === 404);

  // Post-final correction: void hp[0]'s Ultra-Time 4PT make. The live box score (and therefore
  // fourPoint.home.made) is derived from the STATISTICIAN's events, not the scorer's - voiding
  // the scorer-sourced `fourPointEvent` would leave the statistician's parallel 4PT event (and
  // thus the derived box score) untouched, so the statistician's own event must be the one voided.
  const statisticianFourPointEvent = await prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id, source: STAT_SOURCE, basePointValue: 4, isUltraTime: true, status: "ACTIVE" } });
  await prisma.$transaction(async (tx) => {
    await tx.gameEvent.update({ where: { id: statisticianFourPointEvent.id }, data: { status: "VOIDED", correctedAt: new Date(), correctedById: ACTOR_ID, correctionReason: "G.20 rehearsal post-final correction test" } });
    await tx.game.update({ where: { id: game.id }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
  });
  const modelAfterCorrection = await buildLivePresentationModelForGame(game.id);
  ok("Correction propagates immediately to the presentation model (4PT dropped, verification cleared)", modelAfterCorrection.fourPoint.home?.made === 0 && !modelAfterCorrection.isStatisticsVerified);
  await materialize();
  const modelAfterReverify = await buildLivePresentationModelForGame(game.id);
  ok("Re-verification restores isStatisticsVerified after the correction", modelAfterReverify.isStatisticsVerified);

  console.log("=== All G.20 rehearsal scenarios passed ===");

  // --- Cleanup ---
  await prisma.playerStat.deleteMany({ where: { gameId: game.id } });
  await prisma.teamStat.deleteMany({ where: { gameId: game.id } });
  await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
  await prisma.gameStarter.deleteMany({ where: { gameId: game.id } });
  await prisma.game.delete({ where: { id: game.id } });
  await prisma.fixture.delete({ where: { id: fixture.id } });
  await prisma.$transaction(async (tx) => { await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID); });
  console.log("=== Rehearsal fully cleaned up. ===");

  const postFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  const postStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const postResidue = await prisma.fixture.count({ where: { recordOrigin: "REHEARSAL" } });
  ok("Real production FINAL game count unchanged", postFinalGames === preFinalGames, { preFinalGames, postFinalGames });
  ok("Real production standings totals unchanged", JSON.stringify(postStandingsSum) === JSON.stringify(preStandingsSum));
  ok("Rehearsal residue is 0 after cleanup", postResidue === 0);

  const finalHealth = await buildSystemHealth("cmt4odhgn0000wokk8fbwr6ro");
  ok("Diagnostics returns to overall HEALTHY after full cleanup", finalHealth.overallStatus === "HEALTHY", finalHealth.overallStatus);
  const finalPresentationState = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("Presentation state Program is empty after cleanup", finalPresentationState.program === null);
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
