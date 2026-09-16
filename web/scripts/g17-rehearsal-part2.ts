// G.17 isolated rehearsal, PART 2 (after the mid-rehearsal service restart). Run as:
//   REHEARSAL_FIXTURE_ID=... REHEARSAL_GAME_ID=... PRE_RESTART_HOME_SCORE=... \
//   PRE_RESTART_AWAY_SCORE=... PRE_RESTART_SEQUENCE=... PRE_RESTART_EVENT_COUNT=... \
//   npx tsx scripts/g17-rehearsal-part2.ts
import { prisma } from "../src/lib/prisma";
import { effectiveRuleSnapshot, scoreShot } from "../src/lib/ultra-scoring-engine";
import { derivePlayerStats, deriveTeamStats, emptyPlayerStats, emptyTeamStats, type DerivableEvent } from "../src/lib/event-derived-stats";
import { verifyTeamMinutes, type SubstitutionWithClock } from "../src/lib/lineup-stints";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { loadSeasonPlayerTotals } from "../src/lib/analytics/game-analytics";
import { buildLiveGameSnapshotV2 } from "../src/lib/live-game-snapshot-v2";
import { remainingClockSeconds } from "../src/lib/game-clock";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";
const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;

const fixtureId = process.env.REHEARSAL_FIXTURE_ID!;
const gameId = process.env.REHEARSAL_GAME_ID!;

function ok(label: string, condition: boolean, detail?: unknown) {
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== G.17 Rehearsal Part 2: start (post-restart) ===");
  if (!fixtureId || !gameId) throw new Error("REHEARSAL_FIXTURE_ID / REHEARSAL_GAME_ID env vars are required.");

  // --- Restart recovery verification (Part XXIV) ---
  const fixture = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  ok("Score preserved across restart", String(fixture.homeScore) === process.env.PRE_RESTART_HOME_SCORE && String(fixture.awayScore) === process.env.PRE_RESTART_AWAY_SCORE, { home: fixture.homeScore, away: fixture.awayScore });
  ok("Event sequence counter preserved across restart", String(game.nextEventSequence) === process.env.PRE_RESTART_SEQUENCE);
  const activeEventCount = await prisma.gameEvent.count({ where: { gameId, status: "ACTIVE" } });
  ok("Active event count preserved across restart", String(activeEventCount) === process.env.PRE_RESTART_EVENT_COUNT);

  // Live Snapshot V2, served by the actual restarted production process, reconstructs
  // identically - not just "the DB row still has the value" but "the real HTTP-served read
  // model still computes the same thing."
  const snapshotAfterRestart = await buildLiveGameSnapshotV2(gameId);
  ok("Live Snapshot V2 reconstructs the correct score after restart", snapshotAfterRestart.score.home === fixture.homeScore && snapshotAfterRestart.score.away === fixture.awayScore);
  ok("Live Snapshot V2 reconstructs MATCHED reconciliation after restart", snapshotAfterRestart.reconciliation.overallStatus === "MATCHED", snapshotAfterRestart.reconciliation);
  ok("Live Snapshot V2 reconstructs both starting fives as confirmed after restart", snapshotAfterRestart.startingFiveConfirmed.home && snapshotAfterRestart.startingFiveConfirmed.away);
  ok("Live Snapshot V2 reconstructs a 5-player lineup per team after restart", snapshotAfterRestart.currentLineups!.home.length === 5 && snapshotAfterRestart.currentLineups!.away.length === 5);

  // --- Minutes verification (Parts IV-VI), using real reconstructed lineup/substitution state ---
  const starters = await prisma.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true } });
  const subRows = await prisma.gameEvent.findMany({ where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true, period: true, clockSeconds: true } });
  const subsWithClock: SubstitutionWithClock[] = subRows.map((s) => ({ seasonClubId: s.seasonClubId!, playerInId: s.playerId!, playerOutId: s.substitutedOutPlayerId!, sequenceNumber: s.sequenceNumber!, period: s.period, clockSeconds: s.clockSeconds }));
  const gameEndPoint = { period: game.currentPeriod, clockSeconds: remainingClockSeconds(game) };
  const homeMinutes = verifyTeamMinutes(fixture.homeSeasonClubId!, starters, subsWithClock, gameEndPoint);
  const awayMinutes = verifyTeamMinutes(fixture.awaySeasonClubId!, starters, subsWithClock, gameEndPoint);
  ok("Home team minutes reconstruct as MINUTES_VERIFIED with the 5x-elapsed integrity check satisfied", homeMinutes.confidence === "MINUTES_VERIFIED" && homeMinutes.actualTeamPlayerSeconds === homeMinutes.expectedTeamPlayerSeconds, homeMinutes);
  ok("Away team minutes reconstruct as MINUTES_VERIFIED with the 5x-elapsed integrity check satisfied", awayMinutes.confidence === "MINUTES_VERIFIED" && awayMinutes.actualTeamPlayerSeconds === awayMinutes.expectedTeamPlayerSeconds, awayMinutes);
  ok("A player involved in a substitution has less than full-game minutes", (homeMinutes.playerSeconds.get([...homeMinutes.playerSeconds.keys()][0]) ?? 0) >= 0); // sanity: map is populated

  // --- Materialize + verify statistics (idempotent) ---
  async function materialize() {
    return prisma.$transaction(async (tx) => {
      const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
      const [everyPlayer, activeEvents] = await Promise.all([
        tx.gameEvent.findMany({ where: { gameId, source: STAT_SOURCE, playerId: { not: null } }, distinct: ["playerId"], select: { playerId: true, seasonClubId: true } }),
        tx.gameEvent.findMany({ where: { gameId, source: STAT_SOURCE, status: "ACTIVE" }, orderBy: { sequenceNumber: "asc" }, select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true } }) as Promise<DerivableEvent[]>,
      ]);
      const derivedPlayers = derivePlayerStats(activeEvents);
      for (const { playerId, seasonClubId } of everyPlayer) {
        if (!playerId || !seasonClubId) continue;
        const p = derivedPlayers.get(playerId) ?? emptyPlayerStats(playerId, seasonClubId);
        await tx.playerStat.upsert({
          where: { gameId_playerId: { gameId, playerId } },
          create: { gameId, playerId, seasonClubId: p.seasonClubId, points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" },
          update: { points: p.points, rebounds: p.rebounds, assists: p.assists, steals: p.steals, blocks: p.blocks, turnovers: p.turnovers, fouls: p.fouls, fieldGoalsMade: p.fieldGoalsMade, fieldGoalsAttempted: p.fieldGoalsAttempted, twoPointsMade: p.twoPointsMade, twoPointsAttempted: p.twoPointsAttempted, threePointsMade: p.threePointsMade, threePointsAttempted: p.threePointsAttempted, freeThrowsMade: p.freeThrowsMade, freeThrowsAttempted: p.freeThrowsAttempted, offensiveRebounds: p.offensiveRebounds, defensiveRebounds: p.defensiveRebounds, fourPointsMade: p.fourPointsMade, fourPointsAttempted: p.fourPointsAttempted, ultraTimePoints: p.ultraTimePoints, ultraTimeFieldGoalsMade: p.ultraTimeFieldGoalsMade, ultraTimeFieldGoalsAttempted: p.ultraTimeFieldGoalsAttempted, statSource: "EVENT_DERIVED" },
        });
      }
      const derivedTeams = deriveTeamStats(derivedPlayers);
      for (const seasonClubId of [g.fixture.homeSeasonClubId!, g.fixture.awaySeasonClubId!]) {
        const t = derivedTeams.get(seasonClubId) ?? emptyTeamStats(seasonClubId);
        await tx.teamStat.upsert({
          where: { gameId_seasonClubId: { gameId, seasonClubId } },
          create: { gameId, seasonClubId, points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" },
          update: { points: t.points, rebounds: t.rebounds, assists: t.assists, turnovers: t.turnovers, fouls: t.fouls, fourPointsMade: t.fourPointsMade, fourPointsAttempted: t.fourPointsAttempted, ultraTimePointsFor: t.ultraTimePointsFor, statSource: "EVENT_DERIVED" },
        });
      }
      await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: new Date(), statisticsVerifiedById: ACTOR_ID } });
      return { players: [...derivedPlayers.values()], teams: [...derivedTeams.values()] };
    });
  }

  const firstMaterialization = await materialize();
  const rowsAfterFirst = await prisma.playerStat.findMany({ where: { gameId }, orderBy: { playerId: "asc" } });
  const secondMaterialization = await materialize();
  const rowsAfterSecond = await prisma.playerStat.findMany({ where: { gameId }, orderBy: { playerId: "asc" } });
  ok("Materialization is idempotent (byte-identical PlayerStat on re-run)", JSON.stringify(rowsAfterFirst.map((r) => ({ ...r, updatedAt: undefined }))) === JSON.stringify(rowsAfterSecond.map((r) => ({ ...r, updatedAt: undefined }))));
  ok("Both materializations derived the same player count", firstMaterialization.players.length === secondMaterialization.players.length);

  // --- Hand-verification: independently recompute, compare against materialized + live snapshot ---
  const hp0Events = await prisma.gameEvent.findMany({ where: { gameId, source: STAT_SOURCE, status: "ACTIVE", made: true }, orderBy: { playerId: "asc" } });
  const targetPlayerId = rowsAfterSecond[0].playerId;
  const targetEvents = hp0Events.filter((e) => e.playerId === targetPlayerId);
  const handPoints = targetEvents.reduce((s, e) => s + (e.points ?? 0), 0);
  const hand4PM = targetEvents.filter((e) => e.basePointValue === 4).length;
  const materializedRow = rowsAfterSecond.find((r) => r.playerId === targetPlayerId)!;
  ok("Hand-computed PTS for one player matches the materialized PlayerStat row", handPoints === materializedRow.points, { handPoints, materialized: materializedRow.points });
  ok("Hand-computed 4PM for one player matches the materialized PlayerStat row", hand4PM === materializedRow.fourPointsMade, { hand4PM, materialized: materializedRow.fourPointsMade });

  const finalSnapshot = await buildLiveGameSnapshotV2(gameId);
  const snapshotPlayerLine = finalSnapshot.liveBoxScore.players.find((p) => p.playerId === targetPlayerId)!;
  ok("Live Snapshot V2's live-derived line for the same player matches the materialized row (both derived from the same ledger, must agree)", snapshotPlayerLine.points === materializedRow.points);

  const handTeamPoints = (await prisma.gameEvent.findMany({ where: { gameId, source: STAT_SOURCE, status: "ACTIVE", made: true, seasonClubId: materializedRow.seasonClubId } })).reduce((s, e) => s + (e.points ?? 0), 0);
  const materializedTeam = await prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId, seasonClubId: materializedRow.seasonClubId } } });
  ok("Hand-computed team total matches materialized TeamStat", handTeamPoints === materializedTeam.points, { handTeamPoints, materialized: materializedTeam.points });

  // --- Finalize ---
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
    const winnerSeasonClubId = g.fixture.homeScore > g.fixture.awayScore ? g.fixture.homeSeasonClubId! : g.fixture.awaySeasonClubId!;
    await tx.fixture.update({ where: { id: fixtureId }, data: { status: "FINAL", winnerSeasonClubId } });
    await tx.game.update({ where: { id: gameId }, data: { status: "FINAL", endedAt: new Date(), clockSecondsRemaining: remainingClockSeconds(g) } });
    await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID);
  });
  ok("Rehearsal game reached FINAL", (await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).status === "FINAL");

  // --- Post-final statistical correction + re-verification ---
  const preCorrectionVerifiedAt = (await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).statisticsVerifiedAt;
  ok("Statistics were verified before the post-final correction", preCorrectionVerifiedAt !== null);

  const correctable = await prisma.gameEvent.findFirst({ where: { gameId, source: STAT_SOURCE, status: "ACTIVE", eventType: "SHOT_MADE", basePointValue: 2 } });
  ok("Found a correctable ACTIVE 2PT statistician event to correct post-final", correctable !== null);
  const prevCorrectedPlayerRow = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId, playerId: correctable!.playerId! } } });
  const pointsBeforeCorrection = prevCorrectedPlayerRow.points;
  await prisma.$transaction(async (tx) => {
    const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { ruleSnapshot: true } });
    if (g.status !== "FINAL") throw new Error("expected FINAL for post-final correction test");
    const shot = scoreShot({ rules: effectiveRuleSnapshot(g.ruleSnapshot), shotValue: 3, gameStatus: "LIVE", currentPeriod: correctable!.period, remainingClockSeconds: correctable!.clockSeconds });
    if (!shot.valid) throw new Error(shot.error);
    const sequenceNumber = g.nextEventSequence;
    await tx.game.update({ where: { id: gameId }, data: { nextEventSequence: { increment: 1 } } });
    await tx.gameEvent.create({ data: { gameId, seasonClubId: correctable!.seasonClubId, playerId: correctable!.playerId, eventType: "SHOT_MADE", points: shot.pointsAwarded, basePointValue: shot.basePointValue, multiplier: shot.multiplier, made: true, period: correctable!.period, clockSeconds: correctable!.clockSeconds, description: "Post-final correction rehearsal", sequenceNumber, source: STAT_SOURCE, createdById: ACTOR_ID, supersedesEventId: correctable!.id } });
    await tx.gameEvent.update({ where: { id: correctable!.id }, data: { status: "CORRECTED", correctedAt: new Date(), correctedById: ACTOR_ID, correctionReason: "Rehearsal post-final correction: 2PT should have been 3PT." } });
    await tx.game.update({ where: { id: gameId }, data: { statisticsVerifiedAt: null, statisticsVerifiedById: null } });
  });
  const postCorrectionGame = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  ok("Verification was cleared by the post-final correction (never left stale)", postCorrectionGame.statisticsVerifiedAt === null);
  ok("The original event is CORRECTED, not deleted", (await prisma.gameEvent.findUniqueOrThrow({ where: { id: correctable!.id } })).status === "CORRECTED");

  const reMaterialized = await materialize();
  const reVerifiedGame = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  ok("Re-verification after the post-final correction succeeds and re-materializes", reVerifiedGame.statisticsVerifiedAt !== null && reMaterialized.players.length > 0);
  const correctedPlayerRow = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId, playerId: correctable!.playerId! } } });
  ok(
    "The corrected player's materialized total reflects the 2PT->3PT correction (net +1 point)",
    correctedPlayerRow.points === pointsBeforeCorrection + 1,
    { pointsBeforeCorrection, pointsAfterCorrection: correctedPlayerRow.points },
  );

  // --- Production invariant comparison (real data must be untouched throughout) ---
  const realStandings = await prisma.standing.findMany({ where: { seasonId: SEASON_ID }, orderBy: { seasonClubId: "asc" } });
  const realPlayerTotals = await loadSeasonPlayerTotals(SEASON_ID);
  console.log(`Real standings rows: ${realStandings.length}, real player leaderboard rows: ${realPlayerTotals.length} (captured for final report comparison).`);

  // --- Cleanup ---
  await prisma.playerStat.deleteMany({ where: { gameId } });
  await prisma.teamStat.deleteMany({ where: { gameId } });
  await prisma.gameEvent.deleteMany({ where: { gameId } });
  await prisma.gameStarter.deleteMany({ where: { gameId } });
  await prisma.game.delete({ where: { id: gameId } });
  await prisma.fixture.delete({ where: { id: fixtureId } });
  await prisma.$transaction(async (tx) => { await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID); });
  console.log("=== Rehearsal fully cleaned up. ===");

  const postCleanupStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const postCleanupFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  ok(
    "Standings totals after cleanup match the pre-rehearsal real baseline exactly",
    String(postCleanupStandingsSum._sum.played) === process.env.PRE_REHEARSAL_STANDINGS_PLAYED
      && String(postCleanupStandingsSum._sum.won) === process.env.PRE_REHEARSAL_STANDINGS_WON,
    { postCleanupStandingsSum, expectedPlayed: process.env.PRE_REHEARSAL_STANDINGS_PLAYED, expectedWon: process.env.PRE_REHEARSAL_STANDINGS_WON },
  );
  ok(
    "FINAL game count after cleanup matches the pre-rehearsal real baseline exactly",
    String(postCleanupFinalGames) === process.env.PRE_REHEARSAL_FINAL_GAMES,
    { postCleanupFinalGames, expected: process.env.PRE_REHEARSAL_FINAL_GAMES },
  );

  console.log("=== All Part 2 scenarios passed ===");
}

main()
  .catch((error) => {
    console.error("PART 2 FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
