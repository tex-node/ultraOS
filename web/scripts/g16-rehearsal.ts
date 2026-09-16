// G.16 isolated full-game rehearsal. Exercises the same domain logic and Prisma writes the
// real server actions perform (scorer + statistician consoles, starting five, structured
// substitutions, lineup validation, event-derived stat engine, materialization/verification),
// against a dedicated throw-away Fixture/Game (recordOrigin: REHEARSAL) inside the real Season
// Zero season - same methodology as g15-rehearsal.ts, for the same reason (cannot authenticate
// via browser to drive the real UI).
//
// UNLIKE g15-rehearsal.ts, this rehearsal DOES finalize the game and DOES call
// recalculateStandings() - the whole point is to prove the Part III isolation fix
// (competitiveFixtureScope) actually protects real production standings/analytics from a
// REHEARSAL-origin FINAL fixture, which is exactly the scenario that was unsafe before this
// track's fix.
import { prisma } from "../src/lib/prisma";
import {
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  scoreShot,
} from "../src/lib/ultra-scoring-engine";
import { reconcileGameScore } from "../src/lib/reconciliation";
import { derivePlayerStats, deriveTeamStats, deriveTeamScore, emptyPlayerStats, emptyTeamStats, type DerivableEvent } from "../src/lib/event-derived-stats";
import { deriveLineup, validateSubstitution } from "../src/lib/lineup";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { loadSeasonPlayerTotals } from "../src/lib/analytics/game-analytics";
import { remainingClockSeconds } from "../src/lib/game-clock";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;
const SCORER_SOURCE = "ULTRA_NATIVE_LIVE_SCORER" as const;

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== G.16 Rehearsal: start ===");

  // --- Pre-rehearsal baseline, to compare against after full cleanup ---
  const preStandings = await prisma.standing.findMany({ where: { seasonId: SEASON_ID }, orderBy: { seasonClubId: "asc" } });
  const prePlayerTotals = await loadSeasonPlayerTotals(SEASON_ID);
  const preFinalGames = await prisma.game.count({ where: { status: "FINAL" } });

  const clubs = await prisma.seasonClub.findMany({
    where: { seasonId: SEASON_ID },
    include: { players: { include: { athlete: true }, take: 10 } },
    take: 2,
  });
  const [home, away] = clubs;
  ok("Two real SeasonClubs with at least 7 rostered players found (5 starters + 2 substitutes each)", clubs.length === 2 && clubs.every((c) => c.players.length >= 7));
  const hp = home.players; // home players
  const ap = away.players; // away players

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: {
      seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId,
      homeSeasonClubId: home.id, awaySeasonClubId: away.id,
      scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL",
    },
  });
  let game = await prisma.game.create({
    data: {
      fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, startedAt: new Date(),
      statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS",
    },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created (recordOrigin: REHEARSAL, Fixture.status: SCHEDULED).`);

  // --- Starting five (Part X) ---
  await prisma.gameStarter.createMany({ data: hp.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: home.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  await prisma.gameStarter.createMany({ data: ap.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: away.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  const starterCount = await prisma.gameStarter.count({ where: { gameId: game.id } });
  ok("Exactly 10 starters recorded (5 per team)", starterCount === 10);

  async function currentLineup() {
    const [starters, subs] = await Promise.all([
      prisma.gameStarter.findMany({ where: { gameId: game.id }, select: { seasonClubId: true, playerId: true } }),
      prisma.gameEvent.findMany({ where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true } }),
    ]);
    return deriveLineup(
      starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
      subs.map((s) => ({ seasonClubId: s.seasonClubId!, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber! })),
    );
  }

  async function scorerScore(seasonClubId: string, playerId: string | null, shotValue: number, period: number, clockSeconds: number) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true, ruleSnapshot: true } });
      const shot = scoreShot({ rules: effectiveRuleSnapshot(g.ruleSnapshot), shotValue, gameStatus: g.status, currentPeriod: period, remainingClockSeconds: clockSeconds });
      if (!shot.valid) throw new Error(shot.error);
      const isHome = seasonClubId === g.fixture.homeSeasonClubId!;
      const currentScore = isHome ? g.fixture.homeScore : g.fixture.awayScore;
      const nextScore = currentScore + shot.pointsAwarded;
      await tx.fixture.update({ where: { id: fixture.id }, data: isHome ? { homeScore: nextScore } : { awayScore: nextScore } });
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({
        data: { gameId: game.id, seasonClubId, playerId: playerId ?? undefined, eventType: "SCORE", points: shot.pointsAwarded, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made: true, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal scorer ${shotValue}PT`, sequenceNumber, source: SCORER_SOURCE, createdById: ACTOR_ID },
      });
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
      return tx.gameEvent.create({
        data: { gameId: game.id, seasonClubId, playerId, eventType: shotValue === 1 ? (made ? "FREE_THROW_MADE" : "FREE_THROW_MISSED") : (made ? "SHOT_MADE" : "SHOT_MISSED"), points: made ? shot.pointsAwarded : 0, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal statistician ${shotValue}PT ${made ? "MADE" : "MISS"}`, sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID },
      });
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

  async function substitute(seasonClubId: string, playerInId: string, playerOutId: string, period: number, clockSeconds: number) {
    const lineup = await currentLineup();
    const validation = validateSubstitution(lineup, seasonClubId, playerInId, playerOutId);
    ok(`Substitution ${playerInId.slice(-4)} IN / ${playerOutId.slice(-4)} OUT validates as legal`, validation.valid, validation.valid ? undefined : validation.error);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
      const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
      const sequenceNumber = g.nextEventSequence;
      await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId: playerInId, substitutedOutPlayerId: playerOutId, eventType: "SUBSTITUTION", period, clockSeconds, description: "Rehearsal substitution", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
    });
  }

  async function getReconciliation() {
    const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
    const events: DerivableEvent[] = await prisma.gameEvent.findMany({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true } });
    const teamStats = deriveTeamStats(derivePlayerStats(events));
    const homeScore = deriveTeamScore(teamStats, g.fixture.homeSeasonClubId!);
    const awayScore = deriveTeamScore(teamStats, g.fixture.awaySeasonClubId!);
    return reconcileGameScore(g.fixture.homeScore, g.fixture.awayScore, homeScore, awayScore, events.length > 0);
  }

  // --- Full event set: FT/2PT/3PT/4PT make+miss, OREB/DREB/AST/STL/BLK/TOV/FOUL ---
  // The scorer console only ever records actual makes (there is no "miss" concept on the
  // official scoreboard) - so only the `made: true` cases call scorerScore; every case calls
  // statShot, since the statistician tracks both makes and misses independently.
  for (const [shotValue, made] of [[1, true], [1, false], [2, true], [2, false], [3, true], [3, false], [4, true], [4, false]] as const) {
    if (made) await scorerScore(home.id, hp[0].id, shotValue, 1, 500 - shotValue);
    await statShot(home.id, hp[0].id, shotValue, made, 1, 500 - shotValue);
  }

  await statOther(home.id, hp[1].id, "OFFENSIVE_REBOUND", 1, 440);
  await statOther(away.id, ap[1].id, "DEFENSIVE_REBOUND", 1, 435);
  await statOther(home.id, hp[2].id, "ASSIST", 1, 430);
  await statOther(away.id, ap[2].id, "STEAL", 1, 425);
  await statOther(home.id, hp[1].id, "BLOCK", 1, 420);
  await statOther(away.id, ap[1].id, "TURNOVER", 1, 415);
  await statOther(home.id, hp[2].id, "FOUL", 1, 410);

  // --- Substitutions (at least 3 per side) ---
  await substitute(home.id, hp[5].id, hp[0].id, 1, 400);
  await substitute(home.id, hp[6].id, hp[1].id, 1, 390);
  await substitute(home.id, hp[0].id, hp[5].id, 1, 380); // hp[0] re-enters
  await substitute(away.id, ap[5].id, ap[0].id, 1, 370);
  await substitute(away.id, ap[6].id, ap[1].id, 1, 360);
  await substitute(away.id, ap[0].id, ap[5].id, 1, 350);
  const activeSubCount = await prisma.gameEvent.count({ where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" } });
  ok("6 substitutions recorded (3 per side)", activeSubCount === 6);

  // --- Ultra Time: 2PT x2, 3PT x2, 4PT x2 ---
  game = await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 50, clockStartedAt: null } });
  ok("Ultra Time window active (period 2, 50s remaining)", isUltraTimeUnderRules(effectiveRuleSnapshot(null), "LIVE", 2, 50));

  const ultra2 = await scorerScore(home.id, hp[0].id, 2, 2, 50);
  await statShot(home.id, hp[0].id, 2, true, 2, 50);
  ok("2PT during Ultra Time = 4 effective points", ultra2.points === 4 && ultra2.multiplier === 2);

  const ultra3 = await scorerScore(away.id, ap[0].id, 3, 2, 45);
  await statShot(away.id, ap[0].id, 3, true, 2, 45);
  ok("3PT during Ultra Time = 6 effective points", ultra3.points === 6);

  const ultra4 = await scorerScore(home.id, hp[2].id, 4, 2, 40);
  await statShot(home.id, hp[2].id, 4, true, 2, 40);
  ok("4PT during Ultra Time = 8 effective points", ultra4.points === 8);

  let recon = await getReconciliation();
  ok("Reconciliation MATCHED after all made shots recorded on both consoles", recon.overallStatus === "MATCHED", recon);

  // --- Deliberate mismatch, undo, correction, matched again ---
  await scorerScore(away.id, ap[2].id, 2, 2, 30); // no statistician-side entry -> mismatch
  recon = await getReconciliation();
  ok("Reconciliation reports MISMATCH after a scorer-only entry", recon.overallStatus === "MISMATCH", recon);

  await statOther(home.id, hp[1].id, "STEAL", 2, 25); // throwaway, non-scoring, to be undone
  const lastStatEvent = await prisma.gameEvent.findFirst({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  ok("Throwaway STEAL is the most recent ACTIVE statistician event", lastStatEvent?.eventType === "STEAL");
  await prisma.gameEvent.update({ where: { id: lastStatEvent!.id }, data: { status: "VOIDED", correctedAt: new Date(), correctedById: ACTOR_ID, correctionReason: "OPERATOR_UNDO" } });
  ok("Voided event preserved in the ledger, not deleted", (await prisma.gameEvent.findUnique({ where: { id: lastStatEvent!.id } }))!.status === "VOIDED");

  await statShot(away.id, ap[2].id, 2, true, 2, 30); // resolve the mismatch honestly
  recon = await getReconciliation();
  ok("Reconciliation MATCHED again after the missing statistician entry is recorded", recon.overallStatus === "MATCHED", recon);

  // --- Concurrency: simultaneous scorer/stat/substitution writes ---
  // Note: this exercises the shared FOR UPDATE lock's sequence-number safety under genuine
  // concurrent writes (Part XXXIV). Lineup-validation atomicity under concurrent substitutions
  // specifically is proven by code review instead - the real recordSubstitution() action
  // re-derives and re-validates the lineup INSIDE the same locked transaction as its write (see
  // stats-actions.ts), which this rehearsal's simplified substitute() helper does not exactly
  // mirror (it validates before opening its transaction) - not a production safety gap, just a
  // scoping note on what this specific concurrency run proves versus what code review covers.
  const beforeConcurrent = (await prisma.game.findUniqueOrThrow({ where: { id: game.id } })).nextEventSequence;
  await Promise.all([
    statOther(home.id, hp[2].id, "TURNOVER", 2, 20),
    scorerScore(away.id, ap[1].id, 1, 2, 20),
    statOther(away.id, ap[2].id, "FOUL", 2, 15),
    statOther(home.id, hp[3].id, "BLOCK", 2, 15),
  ]);
  const concurrentEvents = await prisma.gameEvent.findMany({ where: { gameId: game.id, sequenceNumber: { gte: beforeConcurrent } }, select: { sequenceNumber: true } });
  const seqValues = concurrentEvents.map((e) => e.sequenceNumber);
  ok("Concurrent writes across scorer and statistician consoles produced distinct sequence numbers (no duplicates)", new Set(seqValues).size === seqValues.length && seqValues.length === 4, seqValues);

  // --- Materialization + verification (Parts VIII, XVI) ---
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
        await tx.playerStat.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId } },
          create: { gameId: game.id, playerId, seasonClubId: p.seasonClubId, points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" },
          update: { points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" },
        });
      }
      const derivedTeams = deriveTeamStats(derivedPlayers);
      for (const seasonClubId of [g.fixture.homeSeasonClubId!, g.fixture.awaySeasonClubId!]) {
        const t = derivedTeams.get(seasonClubId) ?? emptyTeamStats(seasonClubId);
        await tx.teamStat.upsert({
          where: { gameId_seasonClubId: { gameId: game.id, seasonClubId } },
          create: { gameId: game.id, seasonClubId, points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" },
          update: { points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" },
        });
      }
      await tx.game.update({ where: { id: game.id }, data: { statisticsVerifiedAt: new Date(), statisticsVerifiedById: ACTOR_ID } });
      return { players: [...derivedPlayers.values()], teams: [...derivedTeams.values()] };
    });
  }

  const firstMaterialization = await materialize();
  const playerStatRowsAfterFirst = await prisma.playerStat.findMany({ where: { gameId: game.id }, orderBy: { playerId: "asc" } });
  ok("Materialization created PlayerStat rows for every player who ever appeared in the ledger", playerStatRowsAfterFirst.length === firstMaterialization.players.length);
  ok("All materialized rows are stamped statSource EVENT_DERIVED", playerStatRowsAfterFirst.every((r) => r.statSource === "EVENT_DERIVED"));

  const secondMaterialization = await materialize();
  const playerStatRowsAfterSecond = await prisma.playerStat.findMany({ where: { gameId: game.id }, orderBy: { playerId: "asc" } });
  ok("Idempotency: re-running materialization produces byte-identical PlayerStat totals", JSON.stringify(playerStatRowsAfterFirst.map((r) => ({ ...r, updatedAt: undefined, id: undefined }))) === JSON.stringify(playerStatRowsAfterSecond.map((r) => ({ ...r, updatedAt: undefined, id: undefined }))));
  ok("Idempotency: second materialization derived the same player/team counts", secondMaterialization.players.length === firstMaterialization.players.length && secondMaterialization.teams.length === firstMaterialization.teams.length);

  // --- Hand-verification: recompute final score/totals independently ---
  const fxBefore = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  const allActiveScorerEvents = await prisma.gameEvent.findMany({ where: { gameId: game.id, source: SCORER_SOURCE, status: "ACTIVE", eventType: "SCORE" } });
  const handHome = allActiveScorerEvents.filter((e) => e.seasonClubId === home.id).reduce((s, e) => s + (e.points ?? 0), 0);
  const handAway = allActiveScorerEvents.filter((e) => e.seasonClubId === away.id).reduce((s, e) => s + (e.points ?? 0), 0);
  ok("Hand-summed scorer events match the persisted fixture score exactly", handHome === fxBefore.homeScore && handAway === fxBefore.awayScore, { handHome, handAway, fixtureHome: fxBefore.homeScore, fixtureAway: fxBefore.awayScore });

  // Independent cross-check: sum hp[0]'s ACTIVE statistician made-shot events directly from the
  // raw ledger and compare against the materialized PlayerStat row - two separately-computed
  // numbers that must agree, rather than a hand-maintained literal that could itself be wrong.
  const hp0MadeEvents = await prisma.gameEvent.findMany({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE", playerId: hp[0].id, made: true } });
  const hp0RawPoints = hp0MadeEvents.reduce((sum, e) => sum + (e.points ?? 0), 0);
  const hp0Stat = playerStatRowsAfterSecond.find((r) => r.playerId === hp[0].id)!;
  ok("hp[0]'s materialized PTS matches the independently-summed raw ledger total for the same player", hp0Stat.points === hp0RawPoints, { materialized: hp0Stat.points, rawLedgerSum: hp0RawPoints });
  ok("hp[0]'s materialized 4PM matches the count of their ACTIVE made 4PT ledger events", hp0Stat.fourPointsMade === hp0MadeEvents.filter((e) => e.basePointValue === 4).length);

  // --- Finalize (safe now that the isolation fix is in place) + standings ---
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
    const winnerSeasonClubId = g.fixture.homeScore > g.fixture.awayScore ? g.fixture.homeSeasonClubId! : g.fixture.awaySeasonClubId!;
    await tx.fixture.update({ where: { id: fixture.id }, data: { status: "FINAL", winnerSeasonClubId } });
    await tx.game.update({ where: { id: game.id }, data: { status: "FINAL", endedAt: new Date(), clockSecondsRemaining: remainingClockSeconds(g) } });
    await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID);
  });
  const finalizedGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
  ok("Rehearsal game reached FINAL status", finalizedGame.status === "FINAL");

  const postFinalizeStandings = await prisma.standing.findMany({ where: { seasonId: SEASON_ID }, orderBy: { seasonClubId: "asc" } });
  ok(
    "Real production standings are BYTE-IDENTICAL immediately after finalizing a REHEARSAL fixture (the Part III isolation fix in action)",
    JSON.stringify(preStandings.map((s) => ({ ...s, updatedAt: undefined }))) === JSON.stringify(postFinalizeStandings.map((s) => ({ ...s, updatedAt: undefined }))),
  );

  const postFinalizePlayerTotals = await loadSeasonPlayerTotals(SEASON_ID);
  ok(
    "Real player leaderboard totals are unaffected by the rehearsal's materialized PlayerStat rows",
    JSON.stringify(prePlayerTotals) === JSON.stringify(postFinalizePlayerTotals),
  );

  const postFinalizeGameCount = await prisma.game.count({ where: { status: "FINAL" } });
  ok("prisma.game.count({status:FINAL}) DOES include the rehearsal game (expected - only the scoped analytics queries exclude it)", postFinalizeGameCount === preFinalGames + 1);

  console.log(`Final rehearsal score: HOME ${fxBefore.homeScore} — AWAY ${fxBefore.awayScore}`);
  console.log("=== All rehearsal scenarios passed ===");

  // --- Cleanup ---
  await prisma.playerStat.deleteMany({ where: { gameId: game.id } });
  await prisma.teamStat.deleteMany({ where: { gameId: game.id } });
  await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
  await prisma.gameStarter.deleteMany({ where: { gameId: game.id } });
  await prisma.game.delete({ where: { id: game.id } });
  await prisma.fixture.delete({ where: { id: fixture.id } });
  await prisma.$transaction(async (tx) => { await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID); }); // restores real standings now that the rehearsal fixture is gone
  console.log("=== Rehearsal fixture/game/events/starters fully deleted; standings recalculated for the real season only. ===");

  const postCleanupStandings = await prisma.standing.findMany({ where: { seasonId: SEASON_ID }, orderBy: { seasonClubId: "asc" } });
  ok(
    "Standings after cleanup match the pre-rehearsal baseline exactly",
    JSON.stringify(preStandings.map((s) => ({ ...s, updatedAt: undefined }))) === JSON.stringify(postCleanupStandings.map((s) => ({ ...s, updatedAt: undefined }))),
  );
  const postCleanupFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  ok("FINAL game count restored to the pre-rehearsal baseline", postCleanupFinalGames === preFinalGames);
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
