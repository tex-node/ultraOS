// G.17 isolated rehearsal, PART 1 (before the mid-rehearsal service restart). Same methodology
// as g15/g16-rehearsal.ts and the same reason for it (cannot authenticate via browser to drive
// the real UI - entering a password is prohibited regardless of authorization).
//
// Improvement over g16-rehearsal.ts's substitute() helper: that helper validated the lineup
// BEFORE opening its write transaction, which the G.16 report flagged as not exactly mirroring
// production's atomicity (the real recordSubstitution() re-derives and re-validates INSIDE the
// same locked transaction as the write). This script's substituteAtomic() fixes that - lock,
// re-derive the lineup, validate, and write, all inside one transaction - so the concurrent
// substitution race test (Part XXV) is testing the real atomicity guarantee, not an
// approximation of it.
import { prisma } from "../src/lib/prisma";
import { effectiveRuleSnapshot, isUltraTimeUnderRules, scoreShot } from "../src/lib/ultra-scoring-engine";
import { reconcileGameScore } from "../src/lib/reconciliation";
import { derivePlayerStats, deriveTeamStats, deriveTeamScore, type DerivableEvent } from "../src/lib/event-derived-stats";
import { deriveLineup, validateSubstitution } from "../src/lib/lineup";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;
const SCORER_SOURCE = "ULTRA_NATIVE_LIVE_SCORER" as const;

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== G.17 Rehearsal Part 1: start ===");

  const preStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const preFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  console.log(`PRE_REHEARSAL_STANDINGS_PLAYED=${preStandingsSum._sum.played}`);
  console.log(`PRE_REHEARSAL_STANDINGS_WON=${preStandingsSum._sum.won}`);
  console.log(`PRE_REHEARSAL_FINAL_GAMES=${preFinalGames}`);

  const clubs = await prisma.seasonClub!.findMany({
    where: { seasonId: SEASON_ID },
    include: { players: { include: { athlete: true }, take: 10 } },
    take: 2,
  });
  const [home, away] = clubs;
  ok("Two real SeasonClubs with at least 7 rostered players found", clubs.length === 2 && clubs.every((c) => c.players.length >= 7));
  const hp = home.players;
  const ap = away.players;

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: {
      seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId,
      homeSeasonClubId: home.id, awaySeasonClubId: away.id,
      scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL",
    },
  });
  const game = await prisma.game.create({
    data: {
      fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, startedAt: new Date(),
      statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS",
    },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created.`);
  console.log(`REHEARSAL_FIXTURE_ID=${fixture.id}`);
  console.log(`REHEARSAL_GAME_ID=${game.id}`);

  // --- Starting five ---
  await prisma.gameStarter.createMany({ data: hp.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: home.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  await prisma.gameStarter.createMany({ data: ap.slice(0, 5).map((p) => ({ gameId: game.id, seasonClubId: away.id, playerId: p.id, confirmedById: ACTOR_ID })) });
  ok("10 starters recorded", (await prisma.gameStarter.count({ where: { gameId: game.id } })) === 10);

  async function scorerScore(seasonClubId: string, playerId: string, shotValue: number, period: number, clockSeconds: number) {
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
      return tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId, eventType: "SCORE", points: shot.pointsAwarded, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made: true, isFourPointAttempt: shotValue === 4, isUltraTime: shot.isUltraTime, period, clockSeconds, description: `Rehearsal scorer ${shotValue}PT`, sequenceNumber, source: SCORER_SOURCE, createdById: ACTOR_ID } });
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

  // Mirrors recordSubstitution() exactly: lock, re-derive the lineup from currently-persisted
  // starters+ACTIVE substitutions, validate, and write - all inside one transaction. Returns
  // a result object instead of throwing on an invalid swap, so a concurrency test can observe
  // "one succeeded, one failed safely" without one Promise.all member's rejection stopping the
  // other from resolving.
  async function substituteAtomic(seasonClubId: string, playerInId: string, playerOutId: string, period: number, clockSeconds: number): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixture.id} FOR UPDATE`;
        const g = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
        const [starters, activeSubs] = await Promise.all([
          tx.gameStarter.findMany({ where: { gameId: game.id }, select: { seasonClubId: true, playerId: true } }),
          tx.gameEvent.findMany({ where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true } }),
        ]);
        const lineup = deriveLineup(
          starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
          activeSubs.map((s) => ({ seasonClubId: s.seasonClubId!, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber! })),
        );
        const validation = validateSubstitution(lineup, seasonClubId, playerInId, playerOutId);
        if (!validation.valid) throw new Error(validation.error);
        const sequenceNumber = g.nextEventSequence;
        await tx.game.update({ where: { id: game.id }, data: { nextEventSequence: { increment: 1 } } });
        await tx.gameEvent.create({ data: { gameId: game.id, seasonClubId, playerId: playerInId, substitutedOutPlayerId: playerOutId, eventType: "SUBSTITUTION", period, clockSeconds, description: "Rehearsal substitution", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID } });
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function getReconciliation() {
    const g = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: { fixture: true } });
    const events: DerivableEvent[] = await prisma.gameEvent.findMany({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true } });
    const teamStats = deriveTeamStats(derivePlayerStats(events));
    return reconcileGameScore(g.fixture.homeScore, g.fixture.awayScore, deriveTeamScore(teamStats, g.fixture.homeSeasonClubId!), deriveTeamScore(teamStats, g.fixture.awaySeasonClubId!), events.length > 0);
  }

  // --- Full event set ---
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

  // --- Substitutions: multiple stints per side ---
  const sub1 = await substituteAtomic(home.id, hp[5].id, hp[0].id, 1, 400);
  ok("Substitution 1 (home) succeeds", sub1.ok);
  const sub2 = await substituteAtomic(away.id, ap[5].id, ap[0].id, 1, 390);
  ok("Substitution 2 (away) succeeds", sub2.ok);
  const sub3 = await substituteAtomic(home.id, hp[0].id, hp[5].id, 1, 380); // hp[0] re-enters
  ok("Substitution 3 (home, re-entry) succeeds", sub3.ok);

  // --- Real concurrent substitution race (Part XXV): two conflicting requests for the same
  // swap, fired simultaneously. Expect exactly one to succeed and one to fail safely, lineup
  // stays at exactly 5, no duplicate player. ---
  const [raceA, raceB] = await Promise.all([
    substituteAtomic(away.id, ap[6].id, ap[1].id, 1, 370),
    substituteAtomic(away.id, ap[6].id, ap[1].id, 1, 370), // identical conflicting request
  ]);
  const raceResults = [raceA, raceB];
  ok("Concurrent conflicting substitution requests: exactly one succeeded", raceResults.filter((r) => r.ok).length === 1, raceResults);
  ok("Concurrent conflicting substitution requests: exactly one failed safely (not silently corrupted)", raceResults.filter((r) => !r.ok).length === 1, raceResults);

  const lineupAfterRace = deriveLineup(
    (await prisma.gameStarter.findMany({ where: { gameId: game.id }, select: { seasonClubId: true, playerId: true } })).map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
    (await prisma.gameEvent.findMany({ where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true } }))
      .map((s) => ({ seasonClubId: s.seasonClubId!, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber! })),
  );
  ok("Lineup remains exactly 5 players per team after the concurrent substitution race", lineupAfterRace.get(away.id)!.size === 5 && lineupAfterRace.get(home.id)!.size === 5);
  const awayOnCourt = [...lineupAfterRace.get(away.id)!];
  ok("No duplicate player in the post-race lineup", new Set(awayOnCourt).size === awayOnCourt.length);

  const activeSubEvents = await prisma.gameEvent.findMany({ where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" } });
  ok("The ledger recorded exactly one ACTIVE substitution event from the race (the other failed before writing anything)", activeSubEvents.filter((e) => e.playerId === ap[6].id).length === 1);

  // --- Ultra Time: 2PT x2, 3PT x2, 4PT x2 ---
  await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 50, clockStartedAt: null } });
  ok("Ultra Time window active", isUltraTimeUnderRules(effectiveRuleSnapshot(null), "LIVE", 2, 50));
  const ultra2 = await scorerScore(home.id, hp[0].id, 2, 2, 50);
  await statShot(home.id, hp[0].id, 2, true, 2, 50);
  ok("2PT Ultra Time = 4 effective points", ultra2.points === 4);
  const ultra3 = await scorerScore(away.id, ap[0].id, 3, 2, 45);
  await statShot(away.id, ap[0].id, 3, true, 2, 45);
  ok("3PT Ultra Time = 6 effective points", ultra3.points === 6);
  const ultra4 = await scorerScore(home.id, hp[2].id, 4, 2, 40);
  await statShot(home.id, hp[2].id, 4, true, 2, 40);
  ok("4PT Ultra Time = 8 effective points", ultra4.points === 8);

  let recon = await getReconciliation();
  ok("Reconciliation MATCHED after all made shots recorded on both consoles", recon.overallStatus === "MATCHED", recon);

  // --- Mismatch, undo, correction, matched again ---
  await scorerScore(away.id, ap[2].id, 2, 2, 30);
  recon = await getReconciliation();
  ok("Reconciliation MISMATCH after a scorer-only entry", recon.overallStatus === "MISMATCH", recon);

  await statOther(home.id, hp[1].id, "STEAL", 2, 25); // throwaway, to be undone
  const lastStatEvent = await prisma.gameEvent.findFirst({ where: { gameId: game.id, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  ok("Throwaway STEAL is the most recent ACTIVE statistician event", lastStatEvent?.eventType === "STEAL");
  await prisma.gameEvent.update({ where: { id: lastStatEvent!.id }, data: { status: "VOIDED", correctedAt: new Date(), correctedById: ACTOR_ID, correctionReason: "OPERATOR_UNDO" } });

  await statShot(away.id, ap[2].id, 2, true, 2, 30);
  recon = await getReconciliation();
  ok("Reconciliation MATCHED again after the missing statistician entry is recorded", recon.overallStatus === "MATCHED", recon);

  // Snapshot the pre-restart score/state for later comparison.
  const preRestartFixture = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  const preRestartGame = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
  console.log(`PRE_RESTART_HOME_SCORE=${preRestartFixture.homeScore}`);
  console.log(`PRE_RESTART_AWAY_SCORE=${preRestartFixture.awayScore}`);
  console.log(`PRE_RESTART_SEQUENCE=${preRestartGame.nextEventSequence}`);
  console.log(`PRE_RESTART_EVENT_COUNT=${await prisma.gameEvent.count({ where: { gameId: game.id, status: "ACTIVE" } })}`);

  console.log("=== Part 1 complete. Restart the ultraos-web.service now, then run g17-rehearsal-part2.ts with these IDs. ===");
}

main()
  .catch((error) => {
    console.error("PART 1 FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
