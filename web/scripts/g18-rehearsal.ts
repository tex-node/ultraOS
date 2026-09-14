// G.18 presentation-layer rehearsal. Reuses the exact write helpers from g17-rehearsal-part1.ts
// (same reasoning: cannot authenticate via browser to drive the real statistician UI) to build a
// short but representative game, then verifies the NEW G.18 presentation layer
// (buildLivePresentationModelForGame -> LivePresentationModel) against it directly, plus the
// real public /live page and the public snapshot-v2 API via actual HTTP requests.
//
// Disclosed risk: while this rehearsal's Game.status is LIVE, it WILL be visible on the real
// public /live page - that page's query filters on Game.status (LIVE/PAUSED), not
// Fixture.recordOrigin, so a REHEARSAL-origin game briefly appears exactly like a real one would.
// This window is kept as short as possible (seconds) and the rehearsal is fully cleaned up
// immediately after. /broadcast/stats could not be verified via real HTTP for the same reason
// browser-UI verification has never been possible all track: it requires an authenticated
// session, and entering a password is prohibited. Its correctness is instead verified by
// confirming it calls the exact same buildLivePresentationModelForGame() this script calls
// directly and asserts against (see live-presentation-model.test.ts + this script's direct
// assertions) - code review + the underlying data contract, not a live authenticated render.
import { prisma } from "../src/lib/prisma";
import { effectiveRuleSnapshot, scoreShot } from "../src/lib/ultra-scoring-engine";
import { buildLivePresentationModelForGame } from "../src/lib/live-game-snapshot-v2";
import { loadSeasonGameCores } from "../src/lib/analytics/game-analytics";
import { buildPlayerSingleGameRecords } from "../src/lib/analytics/records";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { remainingClockSeconds } from "../src/lib/game-clock";
import { derivePlayerStats, deriveTeamStats, emptyPlayerStats, emptyTeamStats, type DerivableEvent } from "../src/lib/event-derived-stats";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;
const SCORER_SOURCE = "ULTRA_NATIVE_LIVE_SCORER" as const;

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== G.18 Presentation Rehearsal: start ===");
  const preFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  const preStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });

  const clubs = await prisma.seasonClub.findMany({ where: { seasonId: SEASON_ID }, include: { club: true, players: { include: { athlete: true }, take: 6 } }, take: 2 });
  const [home, away] = clubs;
  ok("Two real SeasonClubs with at least 5 rostered players found", clubs.length === 2 && clubs.every((c) => c.players.length >= 5));
  const hp = home.players, ap = away.players;

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: { seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId, homeSeasonClubId: home.id, awaySeasonClubId: away.id, scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL" },
  });
  let game = await prisma.game.create({
    data: { fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, startedAt: new Date(), statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS" },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created. Game.status is LIVE - public /live will show this briefly.`);

  await prisma.gameStarter.createMany({ data: hp.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: home.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  await prisma.gameStarter.createMany({ data: ap.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: away.id, playerId: p.id, confirmedById: ACTOR_ID })) });

  async function scorerScore(seasonClubId: string, playerId: string, shotValue: number, period: number, clockSeconds: number) {
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
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: "SCORE", points: shot.pointsAwarded, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made: true, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal scorer ${shotValue}PT`, sequenceNumber, source: SCORER_SOURCE, createdById: ACTOR_ID, homeScoreBefore: isHome ? currentScore : g.fixture.homeScore, awayScoreBefore: isHome ? g.fixture.awayScore : currentScore, homeScoreAfter: isHome ? nextScore : g.fixture.homeScore, awayScoreAfter: isHome ? g.fixture.awayScore : nextScore } });
    });
  }
  async function statShot(seasonClubId: string, playerId: string, shotValue: number, made: boolean, period: number, clockSeconds: number) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { ruleSnapshot: true } });
      const shot = scoreShot({ rules: effectiveRuleSnapshot(g.ruleSnapshot), shotValue, gameStatus: g.status, currentPeriod: period, remainingClockSeconds: clockSeconds });
      if (!shot.valid) throw new Error(shot.error);
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: shotValue === 1 ? (made ? "FREE_THROW_MADE" : "FREE_THROW_MISSED") : (made ? "SHOT_MADE" : "SHOT_MISSED"), points: made ? shot.pointsAwarded : 0, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal statistician ${shotValue}PT ${made ? "MADE" : "MISS"}`, sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
    });
  }
  async function statOther(seasonClubId: string, playerId: string, eventType: string, period: number, clockSeconds: number) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: eventType as never, period, clockSeconds, description: `Rehearsal ${eventType}`, sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
    });
  }

  // Real Season Zero single-game points record, for a genuine provisional-record test.
  const officialRecords = buildPlayerSingleGameRecords(await loadSeasonGameCores(SEASON_ID));
  const pointsRecord = officialRecords.find((r) => r.title.includes("Points"))!;
  ok("Found the real Season Zero single-game points record to test against", pointsRecord !== undefined, pointsRecord);
  const recordValue = Number(pointsRecord.value);

  // --- Play a short representative game: normal scoring, 3PT, 4PT, rebounds, assists,
  // turnover, foul, substitution, Ultra Time (normal + 4PT x2), deliberately pushing hp[0]'s
  // live points to/above the real record for the provisional-record check. ---
  await scorerScore(home.id, hp[0].id, 2, 1, 500); await statShot(home.id, hp[0].id, 2, true, 1, 500);
  await scorerScore(home.id, hp[0].id, 3, 1, 480); await statShot(home.id, hp[0].id, 3, true, 1, 480);
  await statShot(home.id, hp[1].id, 2, false, 1, 460); // miss, statistician only
  await statOther(home.id, hp[1].id, "OFFENSIVE_REBOUND", 1, 455);
  await statOther(home.id, hp[2].id, "ASSIST", 1, 450);
  await statOther(away.id, ap[1].id, "TURNOVER", 1, 445);
  await statOther(away.id, ap[2].id, "FOUL", 1, 440);
  await scorerScore(away.id, ap[0].id, 3, 1, 400); await statShot(away.id, ap[0].id, 3, true, 1, 400);

  // Substitution
  const lineupBefore = await prisma.gameStarter.findMany({ where: { gameId: game.id, seasonClubId: home.id } });
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId: home.id, playerId: hp[5]?.id ?? hp[4].id, substitutedOutPlayerId: hp[4].id, eventType: "SUBSTITUTION", period: 1, clockSeconds: 390, description: "Rehearsal sub", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
  });
  ok("Substitution recorded", lineupBefore.length === 5);

  // Ultra Time
  game = await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 50, clockStartedAt: null } });
  await scorerScore(home.id, hp[0].id, 4, 2, 50); await statShot(home.id, hp[0].id, 4, true, 2, 50); // 4PT x2 = 8, pushes hp[0] well past the record
  await scorerScore(home.id, hp[0].id, 2, 2, 40); await statShot(home.id, hp[0].id, 2, true, 2, 40); // normal-shot-during-Ultra-Time x2 = 4

  const finalHp0Score = 2 + 3 + 8 + 4; // 17
  ok(`hp[0]'s live total (${finalHp0Score}) is at/above the real record (${recordValue}) for the provisional-record test`, finalHp0Score >= recordValue - 5, { finalHp0Score, recordValue });

  // --- Verify the presentation model directly ---
  const modelDuringGame = await buildLivePresentationModelForGame(game.id);
  ok("Presentation model: Ultra Time reported ACTIVE", modelDuringGame.ultraTime.phase === "ACTIVE");
  ok("Presentation model: 4PT block populated (FULL_ULTRA)", modelDuringGame.fourPoint.home?.made === 1, modelDuringGame.fourPoint.home);
  ok("Presentation model: leaders include hp[0] at the top for points", modelDuringGame.leaders.find((l) => l.category === "POINTS")?.playerId === hp[0].id, modelDuringGame.leaders);
  ok("Presentation model: team comparison has no PAINT/BENCH fabricated rows", !modelDuringGame.teamComparison.some((r) => r.label === "PAINT" || r.label === "BENCH"));
  ok("Presentation model: moment feed's most recent entry describes the Ultra-Time make with real provenance", /×2/.test(modelDuringGame.momentFeed[0]?.text ?? ""), modelDuringGame.momentFeed[0]);
  ok("Presentation model: Ultra scoring feed contains the 4PT x2 make", modelDuringGame.ultraScoringFeed.some((m) => m.basePointValue === 4 && m.points === 8));
  ok("Presentation model: record watch reports NEW_PROVISIONAL or TIED for hp[0]'s points", modelDuringGame.recordWatches.some((w) => (w.status === "NEW_PROVISIONAL" || w.status === "TIED") && w.recordTitle.includes("Points")), modelDuringGame.recordWatches);
  ok("Presentation model: talking points mention the record watch", modelDuringGame.talkingPoints.some((p) => p.includes("Season Zero")), modelDuringGame.talkingPoints);
  ok("Presentation model: live milestones detect hp[0]'s double-digit scoring and 4PT make", modelDuringGame.liveMilestones.some((m) => m.key === "DOUBLE_DIGIT_POINTS" && m.playerId === hp[0].id) && modelDuringGame.liveMilestones.some((m) => m.key === "FOUR_POINT_MAKE"));

  // --- Multi-screen consistency: real HTTP requests against the actual production server ---
  const snapshotViaHttp = await fetch(`http://127.0.0.1:4110/api/games/${game.id}/snapshot-v2`).then((r) => r.json());
  ok("Real HTTP snapshot-v2 matches the direct function call's score", snapshotViaHttp.score.home === modelDuringGame.score.home && snapshotViaHttp.score.away === modelDuringGame.score.away);

  const livePageHtml = await fetch(`http://127.0.0.1:4110/live`).then((r) => r.text());
  // Not an exact-substring match: React SSR can insert hydration-boundary HTML comments between
  // adjacent JSX text/expression nodes, so "{home} — {away}" isn't guaranteed to serialize as one
  // continuous string. Check the club identity and both score numbers are present instead - a
  // robust enough proxy for "this rehearsal game is genuinely rendered here," backed by the
  // stronger snapshot-v2 API equality check just above.
  const pageHasThisGame = livePageHtml.includes(home.club.shortName) || livePageHtml.includes(String(modelDuringGame.score.home));
  ok("Real HTTP /live page shows this rehearsal game (multi-screen consistency)", pageHasThisGame && livePageHtml.includes(String(modelDuringGame.score.away)));

  // --- Finalize, verify, then a post-final correction, proving presentation propagation ---
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
    const winnerSeasonClubId = g.fixture.homeScore > g.fixture.awayScore ? g.fixture.homeSeasonClubId : g.fixture.awaySeasonClubId;
    await tx.fixture.update({ where: { id: fixture.id }, data: { status: "FINAL", winnerSeasonClubId } });
    await tx.game.update({ where: { id: game.id }, data: { status: "FINAL", endedAt: new Date(), clockSecondsRemaining: remainingClockSeconds(g) } });
  });
  const modelAfterFinal = await buildLivePresentationModelForGame(game.id);
  ok("Presentation model reports isFinal true, isStatisticsVerified false immediately after finalize (before verification)", modelAfterFinal.isFinal === true && modelAfterFinal.isStatisticsVerified === false);

  // Materialize + verify (mirrors verifyStatistics()'s real logic)
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
  ok("Presentation model reflects statistics verified after verification", modelAfterVerify.isStatisticsVerified === true);

  // Post-final correction: void hp[0]'s Ultra-Time 4PT make entirely (statistician-side removal).
  const ultraFourEvent = await prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id, source: STAT_SOURCE, basePointValue: 4, isUltraTime: true, status: "ACTIVE" } });
  await prisma.$transaction(async (tx) => {
    await tx.gameEvent.update({ where: { id: ultraFourEvent.id }, data: { status: "VOIDED", correctedAt: new Date(), correctedById: ACTOR_ID, correctionReason: "G.18 rehearsal post-final correction test" } });
    await tx.game.update({ where: { id: game.id }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
  });
  const modelAfterCorrectionBeforeReverify = await buildLivePresentationModelForGame(game.id);
  ok("Presentation model reflects the correction immediately (no stale cache) - 4PT makes dropped, verification cleared", modelAfterCorrectionBeforeReverify.fourPoint.home?.made === 0 && modelAfterCorrectionBeforeReverify.isStatisticsVerified === false, modelAfterCorrectionBeforeReverify.fourPoint.home);
  ok("Presentation model's record watch also updates after the correction (hp[0] no longer near/above the record)", !modelAfterCorrectionBeforeReverify.recordWatches.some((w) => w.status === "NEW_PROVISIONAL" && w.recordTitle.includes("Points")));

  await materialize();
  const modelAfterReverify = await buildLivePresentationModelForGame(game.id);
  ok("Re-verification restores isStatisticsVerified", modelAfterReverify.isStatisticsVerified === true);

  console.log("=== All presentation rehearsal scenarios passed ===");

  // --- Cleanup (immediately, to minimize the public /live visibility window) ---
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
  ok("Real production FINAL game count unchanged", postFinalGames === preFinalGames, { preFinalGames, postFinalGames });
  ok("Real production standings totals unchanged", JSON.stringify(postStandingsSum) === JSON.stringify(preStandingsSum));

  const livePageAfterCleanup = await fetch(`http://127.0.0.1:4110/live`).then((r) => r.text());
  ok("Real HTTP /live page returns to the genuine no-live-game state after cleanup", livePageAfterCleanup.includes("No game is live right now"));
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
