// A3a Batches 10a-12 rehearsal: exercises the REAL canonical-write services this session built
// (withGameWrite, createGameEvent, applyPlayerShotStatDeltas/applyTeamShotStatDeltas,
// applyCountingStatDelta, voidScoreEvent, correctScoreEvent) directly against a real database,
// against a dedicated throw-away Fixture/Game (recordOrigin: REHEARSAL) inside the real Season
// Zero season - same safety pattern as scripts/g15-rehearsal.ts.
//
// Why this calls the canonical services directly instead of actions.ts's exported server actions
// (recordScore, recordStatEvent, etc.): those require requireFixturePermission/requireSession,
// which need a real Next.js request context (cookies) unavailable to a plain script - and
// entering a real admin password into a login form to get one is prohibited regardless of
// authorization (the exact constraint g15-rehearsal.ts's own header names). This script's helper
// functions below mirror those actions' bodies exactly (same calls, same order), substituting an
// explicit actor for the session-derived one - not a shortcut around the logic under test, only
// around the login form.
//
// Requires NODE_OPTIONS=--conditions=react-server to resolve the "server-only" package guard to
// its empty stub (the condition it uses in a real Next.js server build) instead of the throwing
// default a plain Node/tsx run would otherwise get.
import { prisma } from "../src/lib/prisma";
import {
  withGameWrite,
  createGameEvent,
  applyPlayerShotStatDeltas,
  applyTeamShotStatDeltas,
  applyCountingStatDelta,
  voidScoreEvent,
  correctScoreEvent,
} from "../src/server/scoring";
import {
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  negateShotStatDeltas,
  scoreShot,
  shotStatDeltas,
} from "../src/lib/ultra-scoring-engine";
import { remainingClockSeconds } from "../src/lib/game-clock";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const ORGANIZATION_ID = "cmt4odhgn0000wokk8fbwr6ro";
const SEASON_ID = "cmqfqpnkr0005lgkkihisj759";

function ok(label: string, condition: boolean, detail?: unknown) {
  const status = condition ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) throw new Error(`REHEARSAL ASSERTION FAILED: ${label}`);
}

async function main() {
  console.log("=== Batch 10a-12 rehearsal: start ===");

  const clubs = await prisma.seasonClub.findMany({
    where: { seasonId: SEASON_ID },
    include: { players: { include: { athlete: true }, take: 3 } },
    take: 2,
  });
  ok("Two real SeasonClubs with rostered players found", clubs.length === 2 && clubs.every((c) => c.players.length >= 2));
  const [home, away] = clubs;
  const homePlayers = home.players;
  const awayPlayers = away.players;
  console.log(`Home: ${home.id} (${homePlayers.length} players) — Away: ${away.id} (${awayPlayers.length} players)`);

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: {
      seasonId: SEASON_ID,
      divisionId: referenceFixture.divisionId,
      venueId: referenceFixture.venueId,
      homeSeasonClubId: home.id,
      awaySeasonClubId: away.id,
      scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: "SCHEDULED",
      recordOrigin: "REHEARSAL",
    },
  });
  const game = await prisma.game.create({
    data: {
      fixtureId: fixture.id,
      status: "LIVE",
      currentPeriod: 1,
      clockSecondsRemaining: 500,
      startedAt: new Date(),
      statSource: "ULTRA_NATIVE_LIVE_SCORER",
      dataCapability: "ULTRA_NATIVE_EVENTS",
    },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created (recordOrigin: REHEARSAL).`);

  const ctx = { actor: { id: ACTOR_ID, organizationId: ORGANIZATION_ID }, source: "LIVE_UI" as const };

  // --- Mirrors recordScore's body exactly (actions.ts), minus requireFixturePermission ---
  async function score(seasonClubId: string, playerId: string, shotValue: number) {
    return withGameWrite(game.id, fixture.id, ctx, async ({ game: g, tx, ...writeCtx }) => {
      const player = await tx.player.findFirst({ where: { id: playerId, seasonClubId } });
      if (!player) throw new Error("INVALID_PLAYER");
      const shot = scoreShot({
        rules: effectiveRuleSnapshot(g.ruleSnapshot),
        shotValue,
        gameStatus: g.status,
        currentPeriod: g.currentPeriod,
        remainingClockSeconds: remainingClockSeconds(g),
      });
      if (!shot.valid) throw new Error(shot.error);
      const { basePointValue, multiplier, pointsAwarded, isUltraTime: ultraTime } = shot;
      const isHome = seasonClubId === g.fixture.homeSeasonClubId!;
      const currentScore = isHome ? g.fixture.homeScore : g.fixture.awayScore;
      const nextScore = Math.max(0, currentScore + pointsAwarded);
      const actualPoints = nextScore - currentScore;
      await tx.fixture.update({ where: { id: g.fixtureId }, data: isHome ? { homeScore: nextScore } : { awayScore: nextScore } });
      await createGameEvent(
        {
          gameId: g.id, fixtureId: fixture.id, seasonClubId, playerId: player.id, eventType: "SCORE",
          points: actualPoints, basePointValue, multiplier, period: g.currentPeriod, clockSeconds: remainingClockSeconds(g),
          description: `Rehearsal ${shotValue}PT`, made: true, isFourPointAttempt: basePointValue === 4, isUltraTime: ultraTime,
        },
        { ...writeCtx, tx },
      );
      const deltas = shotStatDeltas({ basePointValue, isUltraTime: ultraTime });
      await applyPlayerShotStatDeltas(tx, ORGANIZATION_ID, g.id, player.id, seasonClubId, deltas, actualPoints);
      await applyTeamShotStatDeltas(tx, ORGANIZATION_ID, g.id, seasonClubId, deltas, ultraTime ? actualPoints : 0, 0, nextScore);
      if (ultraTime && actualPoints !== 0) {
        const opposingSeasonClubId = isHome ? g.fixture.awaySeasonClubId! : g.fixture.homeSeasonClubId!;
        await applyTeamShotStatDeltas(
          tx, ORGANIZATION_ID, g.id, opposingSeasonClubId,
          { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
          0, actualPoints, isHome ? g.fixture.awayScore : g.fixture.homeScore,
        );
      }
      return { actualPoints, nextScore, isHome };
    });
  }

  // --- Mirrors recordStatEvent's body exactly ---
  async function statEvent(seasonClubId: string, playerId: string, eventType: "REBOUND" | "ASSIST" | "STEAL" | "BLOCK" | "TURNOVER" | "FOUL") {
    const fieldMap = { REBOUND: "rebounds", ASSIST: "assists", STEAL: "steals", BLOCK: "blocks", TURNOVER: "turnovers", FOUL: "fouls" } as const;
    const ultraFieldMap = { rebounds: "ultraTimeRebounds", assists: "ultraTimeAssists", steals: "ultraTimeSteals", blocks: "ultraTimeBlocks", turnovers: "ultraTimeTurnovers", fouls: "ultraTimeFouls" } as const;
    return withGameWrite(game.id, fixture.id, ctx, async ({ game: g, tx, ...writeCtx }) => {
      const field = fieldMap[eventType];
      const remaining = remainingClockSeconds(g);
      const ultraTime = isUltraTimeUnderRules(effectiveRuleSnapshot(g.ruleSnapshot), g.status, g.currentPeriod, remaining);
      await createGameEvent(
        { gameId: g.id, fixtureId: fixture.id, seasonClubId, playerId, eventType, period: g.currentPeriod, clockSeconds: remaining, description: `Rehearsal ${eventType}`, isUltraTime: ultraTime },
        { ...writeCtx, tx },
      );
      const ultraField = ultraFieldMap[field];
      await applyCountingStatDelta(tx, ORGANIZATION_ID, g.id, playerId, seasonClubId, field, 1, ultraTime ? { field: ultraField, delta: 1 } : null);
    });
  }

  // --- Mirrors undoLastEvent's body exactly ---
  async function undoLast() {
    return withGameWrite(game.id, fixture.id, ctx, async ({ game: g, tx, ...writeCtx }) => {
      const last = await tx.gameEvent.findFirst({ where: { gameId: g.id, eventType: { notIn: ["ULTRA_TIME_STARTED", "ULTRA_TIME_ENDED"] } }, orderBy: { createdAt: "desc" } });
      if (!last) throw new Error("NO_EVENTS_TO_UNDO");
      if (!last.seasonClubId) throw new Error("EVENT_NOT_UNDOABLE");
      const clockSeconds = remainingClockSeconds(g);
      const fieldMap: Record<string, "rebounds" | "assists" | "steals" | "blocks" | "turnovers" | "fouls"> = { REBOUND: "rebounds", ASSIST: "assists", STEAL: "steals", BLOCK: "blocks", TURNOVER: "turnovers", FOUL: "fouls" };
      const ultraFieldMap = { rebounds: "ultraTimeRebounds", assists: "ultraTimeAssists", steals: "ultraTimeSteals", blocks: "ultraTimeBlocks", turnovers: "ultraTimeTurnovers", fouls: "ultraTimeFouls" } as const;
      if (last.eventType === "SCORE") {
        const isHome = last.seasonClubId === g.fixture.homeSeasonClubId!;
        const currentScore = isHome ? g.fixture.homeScore : g.fixture.awayScore;
        const reversal = -(last.points ?? 0);
        const nextScore = Math.max(0, currentScore + reversal);
        const actualReversal = nextScore - currentScore;
        await tx.fixture.update({ where: { id: fixture.id }, data: isHome ? { homeScore: nextScore } : { awayScore: nextScore } });
        await createGameEvent(
          { gameId: g.id, fixtureId: fixture.id, seasonClubId: last.seasonClubId, playerId: last.playerId, eventType: "SCORE", points: actualReversal, period: g.currentPeriod, clockSeconds, description: "Rehearsal undo" },
          { ...writeCtx, tx },
        );
        const reversedDeltas = negateShotStatDeltas(shotStatDeltas({ basePointValue: last.basePointValue, isUltraTime: last.isUltraTime }));
        if (last.playerId && actualReversal !== 0) {
          await applyPlayerShotStatDeltas(tx, ORGANIZATION_ID, g.id, last.playerId, last.seasonClubId, reversedDeltas, actualReversal);
        }
        await applyTeamShotStatDeltas(tx, ORGANIZATION_ID, g.id, last.seasonClubId, reversedDeltas, last.isUltraTime ? actualReversal : 0, 0, nextScore);
        return { undone: last, nextScore };
      } else if (last.playerId && fieldMap[last.eventType]) {
        const field = fieldMap[last.eventType];
        await createGameEvent(
          { gameId: g.id, fixtureId: fixture.id, seasonClubId: last.seasonClubId, playerId: last.playerId, fouledPlayerId: last.fouledPlayerId, foulType: last.foulType, eventType: last.eventType, period: g.currentPeriod, clockSeconds, description: "Rehearsal undo" },
          { ...writeCtx, tx },
        );
        const existing = await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId: g.id, playerId: last.playerId } } });
        if (existing && existing[field] > 0) {
          const ultraField = ultraFieldMap[field];
          const reverseUltraTime = last.isUltraTime && (existing[ultraField] ?? 0) > 0;
          await applyCountingStatDelta(tx, ORGANIZATION_ID, g.id, last.playerId, last.seasonClubId, field, -1, reverseUltraTime ? { field: ultraField, delta: -1 } : null);
        }
        return { undone: last };
      }
      throw new Error("EVENT_NOT_UNDOABLE");
    });
  }

  // ================= Scenario 1: score a 2PT, then immediately undo it =================
  // undoLastEvent only ever targets the single most recent event - undoing the 2PT specifically
  // means calling it right after scoring it, before anything else exists.
  await score(home.id, homePlayers[0].id, 2);
  let fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ok("Step 2: 2PT shot - Fixture.homeScore is 2", fx.homeScore === 2, fx.homeScore);
  let ps = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: homePlayers[0].id } } });
  ok("Step 2: PlayerStat.points/fieldGoalsMade/twoPointsMade all reflect the 2PT make", ps.points === 2 && ps.fieldGoalsMade === 1 && ps.twoPointsMade === 1, ps);
  const ts = await prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: home.id } } });
  ok("Step 2: TeamStat.points reflects the 2PT make", ts.points === 2, ts.points);

  await undoLast();
  fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ps = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: homePlayers[0].id } } });
  ok(
    "Step 6: undoing the 2PT reverses Fixture score AND shot-category deltas (the bug this session fixed)",
    fx.homeScore === 0 && ps.points === 0 && ps.fieldGoalsMade === 0 && ps.twoPointsMade === 0,
    { homeScore: fx.homeScore, playerStat: ps },
  );

  // ================= Scenario 1b: re-score the 2PT and a fresh 3PT for later scenarios =================
  await score(home.id, homePlayers[0].id, 2);
  await score(home.id, homePlayers[1].id, 3);
  fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ok("Step 3: 3PT shot - Fixture.homeScore is 5 (2+3)", fx.homeScore === 5, fx.homeScore);
  let ps2 = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: homePlayers[1].id } } });
  ok("Step 3: PlayerStat.threePointsMade/threePointsAttempted are 1 for the 3PT shooter", ps2.threePointsMade === 1 && ps2.threePointsAttempted === 1, ps2);

  // ================= Scenario 3: a non-shot stat via applyCountingStatDelta =================
  await statEvent(away.id, awayPlayers[0].id, "REBOUND");
  const psRebound = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayers[0].id } } });
  ok("Step 4: recordStatEvent's rebound applied PlayerStat.rebounds via applyCountingStatDelta", psRebound.rebounds === 1, psRebound.rebounds);

  await undoLast(); // undoes the rebound (now the most recent event) - exercises the generic branch
  const psReboundUndone = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayers[0].id } } });
  ok("undoLastEvent's generic branch reverses the counting-stat increment", psReboundUndone.rebounds === 0, psReboundUndone.rebounds);

  // ================= Scenario 4: void a score event =================
  // Uses the away team / a not-yet-scoring player, kept isolated from the home-team scenarios
  // above so the "reverts to zero" assertion doesn't have to account for accumulation from an
  // earlier make by the same player.
  await score(away.id, awayPlayers[1].id, 3);
  const eventToVoid = await prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id, eventType: "SCORE", status: "ACTIVE", playerId: awayPlayers[1].id }, orderBy: { createdAt: "desc" } });
  await withGameWrite(game.id, fixture.id, ctx, (writeCtx) => voidScoreEvent(eventToVoid.id, "Rehearsal void test", writeCtx));
  fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ps2 = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayers[1].id } } });
  const voidedEvent = await prisma.gameEvent.findUniqueOrThrow({ where: { id: eventToVoid.id } });
  ok(
    "Step 5: voidScoreEvent reverses Fixture score, player's points/3PM/3PA, and flips status to VOIDED",
    fx.awayScore === 0 && ps2.points === 0 && ps2.threePointsMade === 0 && voidedEvent.status === "VOIDED",
    { awayScore: fx.awayScore, playerStat: ps2, voidedStatus: voidedEvent.status },
  );

  // ================= Scenario 5: correct a score event (wrong-player correction) =================
  await score(away.id, awayPlayers[0].id, 2); // a 2PT to correct
  const eventToCorrect = await prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id, eventType: "SCORE", status: "ACTIVE", playerId: awayPlayers[0].id }, orderBy: { createdAt: "desc" } });
  const correctionShot = scoreShot({ rules: effectiveRuleSnapshot(null), shotValue: 3, gameStatus: "LIVE", currentPeriod: eventToCorrect.period, remainingClockSeconds: eventToCorrect.clockSeconds ?? 0 });
  ok("Correction shot (3PT) is valid under current rules", correctionShot.valid);
  const correctionResult = await withGameWrite(game.id, fixture.id, ctx, (writeCtx) =>
    correctScoreEvent(
      {
        eventId: eventToCorrect.id,
        reason: "Rehearsal correction test: 2PT -> 3PT, wrong player",
        replacement: {
          playerId: awayPlayers[1].id, // wrong-player correction
          basePointValue: correctionShot.valid ? correctionShot.basePointValue : null,
          multiplier: correctionShot.valid ? correctionShot.multiplier : null,
          isUltraTime: correctionShot.valid ? correctionShot.isUltraTime : false,
          pointsAwarded: correctionShot.valid ? correctionShot.pointsAwarded : 0,
        },
      },
      writeCtx,
    ),
  );
  fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  const originalCorrected = await prisma.gameEvent.findUniqueOrThrow({ where: { id: eventToCorrect.id } });
  const oldPlayerStat = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayers[0].id } } });
  const newPlayerStat = await prisma.playerStat.findUniqueOrThrow({ where: { gameId_playerId: { gameId: game.id, playerId: awayPlayers[1].id } } });
  ok(
    "Step 7: correctScoreEvent reverts the old player's stat, applies the new player's stat, marks the original CORRECTED",
    originalCorrected.status === "CORRECTED" && oldPlayerStat.points === 0 && oldPlayerStat.twoPointsMade === 0 && newPlayerStat.points === 3 && newPlayerStat.threePointsMade === 1,
    { originalStatus: originalCorrected.status, oldPlayerStat, newPlayerStat, actualPoints: correctionResult.actualPoints },
  );
  // actualPoints is the replacement event's OWN point contribution (newScore - baseScore, where
  // baseScore already excludes the original event's points) - equal to the corrected shot's raw
  // pointsAwarded (3) when unclamped, not "new minus old" (which would be 1). This matches the
  // pre-existing, unmigrated correctScoreEventAction's own definition of actualPoints exactly.
  ok("correctScoreEvent's returned actualPoints equals the new shot's own point value (3), not new-minus-old", correctionResult.actualPoints === 3, correctionResult.actualPoints);
  ok("Fixture.awayScore reflects newScore (baseScore 0 + pointsAwarded 3)", fx.awayScore === 3, fx.awayScore);

  // ================= Scenario 6: Ultra-Time-against on void =================
  await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 45, clockStartedAt: null } });
  const ultraActive = isUltraTimeUnderRules(effectiveRuleSnapshot(null), "LIVE", 2, 45);
  ok("Ultra Time window active at period 2, 45s remaining", ultraActive === true);
  await score(home.id, homePlayers[0].id, 4); // Ultra-Time 4PT x2 = 8 points
  const ultraEvent = await prisma.gameEvent.findFirstOrThrow({ where: { gameId: game.id, eventType: "SCORE", isUltraTime: true }, orderBy: { createdAt: "desc" } });
  ok("Ultra-Time 4PT scored 8 points (4 x 2 multiplier)", ultraEvent.points === 8, ultraEvent.points);
  const homeScoreBeforeVoid = (await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore;
  const awayTeamStatBeforeVoid = await prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: away.id } } });
  ok("Opposing (away) team's Ultra-Time-against counter is 8 before the void", awayTeamStatBeforeVoid.ultraTimePointsAgainst === 8, awayTeamStatBeforeVoid.ultraTimePointsAgainst);

  await withGameWrite(game.id, fixture.id, ctx, (writeCtx) => voidScoreEvent(ultraEvent.id, "Rehearsal Ultra-Time void test", writeCtx));
  const homeScoreAfterVoid = (await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } })).homeScore;
  const homeTeamStatAfterVoid = await prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: home.id } } });
  const awayTeamStatAfterVoid = await prisma.teamStat.findUniqueOrThrow({ where: { gameId_seasonClubId: { gameId: game.id, seasonClubId: away.id } } });
  ok(
    "Step 8: voiding the Ultra-Time 4PT reverses BOTH the scoring team's ultraTimePointsFor AND the opposing team's ultraTimePointsAgainst",
    homeScoreAfterVoid === homeScoreBeforeVoid - 8 && homeTeamStatAfterVoid.ultraTimePointsFor === 0 && awayTeamStatAfterVoid.ultraTimePointsAgainst === 0,
    { homeScoreBeforeVoid, homeScoreAfterVoid, homeTeamStatAfterVoid, awayTeamStatAfterVoid },
  );

  // ================= Scenario 7: hand-verify final arithmetic (reconciliation-equivalent) =================
  const allActiveScoreEvents = await prisma.gameEvent.findMany({ where: { gameId: game.id, status: "ACTIVE", eventType: { in: ["SCORE", "SCORE_CORRECTION"] } } });
  const handComputedHome = allActiveScoreEvents.filter((e) => e.seasonClubId === home.id).reduce((sum, e) => sum + (e.points ?? 0), 0);
  const handComputedAway = allActiveScoreEvents.filter((e) => e.seasonClubId === away.id).reduce((sum, e) => sum + (e.points ?? 0), 0);
  fx = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ok(
    "Step 9 (reconciliation-equivalent): hand-summed ACTIVE score events match the persisted Fixture score exactly",
    handComputedHome === fx.homeScore && handComputedAway === fx.awayScore,
    { handComputedHome, handComputedAway, fixtureHome: fx.homeScore, fixtureAway: fx.awayScore },
  );

  // ================= Scenario 8: persistence (re-read fresh, not from any cached reference) =================
  const reread = await prisma.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
  ok("Step 10: a fresh read (not the same reference used to compute it) matches the last known Fixture score", reread.homeScore === fx.homeScore && reread.awayScore === fx.awayScore);

  console.log(`Final rehearsal score: HOME ${fx.homeScore} — AWAY ${fx.awayScore}`);
  console.log("=== All rehearsal scenarios passed ===");

  // --- Cleanup: delete every rehearsal row. Game was never FINAL. ---
  await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
  await prisma.playerStat.deleteMany({ where: { gameId: game.id } });
  await prisma.teamStat.deleteMany({ where: { gameId: game.id } });
  await prisma.game.delete({ where: { id: game.id } });
  await prisma.fixture.delete({ where: { id: fixture.id } });
  console.log("=== Rehearsal fixture/game/events fully deleted. ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
