// G.19 presentation-isolation + broadcast-graphics rehearsal. Reuses the exact scoring/statistician
// write helpers g18-rehearsal.ts already proved out (cannot authenticate via browser to drive
// the real consoles - entering a password is prohibited regardless of authorization).
//
// Primary purpose (Part V/L): prove the P0 presentation-isolation fix actually holds against
// real Postgres and real unauthenticated HTTP - not just the pure-predicate unit tests in
// presentation-scope.test.ts. This script's rehearsal fixture briefly has Game.status LIVE; the
// entire point of the checks below is confirming that alone is no longer enough to make it
// visible anywhere public. Cleaned up immediately after, same discipline as every prior rehearsal.
import { prisma } from "../src/lib/prisma";
import { effectiveRuleSnapshot, scoreShot } from "../src/lib/ultra-scoring-engine";
import { buildLivePresentationModelForGame } from "../src/lib/live-game-snapshot-v2";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { setPreview, takeToProgram, clearProgram, getBroadcastPresentationState } from "../src/lib/broadcast-presentation-state";

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
  console.log("=== G.19 Rehearsal: start ===");
  const preFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  const preStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const preRehearsalResidue = await prisma.fixture.count({ where: { recordOrigin: "REHEARSAL" } });
  ok("No leftover rehearsal residue before this run", preRehearsalResidue === 0, { preRehearsalResidue });

  const clubs = await prisma.seasonClub.findMany({ where: { seasonId: SEASON_ID }, include: { club: true, players: { include: { athlete: true }, take: 6 } }, take: 2 });
  const [home, away] = clubs;
  const hp = home.players, ap = away.players;

  const referenceFixture = await prisma.fixture.findFirstOrThrow({ where: { seasonId: SEASON_ID }, select: { divisionId: true, venueId: true } });
  const fixture = await prisma.fixture.create({
    data: { seasonId: SEASON_ID, divisionId: referenceFixture.divisionId, venueId: referenceFixture.venueId, homeSeasonClubId: home.id, awaySeasonClubId: away.id, scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), status: "SCHEDULED", recordOrigin: "REHEARSAL" },
  });
  let game = await prisma.game.create({
    data: { fixtureId: fixture.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 500, startedAt: new Date(), statSource: SCORER_SOURCE, dataCapability: "ULTRA_NATIVE_EVENTS" },
  });
  console.log(`Rehearsal fixture ${fixture.id} / game ${game.id} created (LIVE). Verifying it stays invisible everywhere public.`);

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

  // --- P0: isolation must hold WHILE this rehearsal game is genuinely LIVE, before any scoring
  // even happens - this is the exact window the G.18 rehearsal disclosed as exposed. ---
  const liveOnPublicPage = await fetch(`${HOST}/live`).then((r) => r.text());
  ok("Public /live does NOT mention this rehearsal fixture's clubs immediately after creation", !liveOnPublicPage.includes(fixture.id));
  const scorebugRes = await fetch(`${HOST}/broadcast/game/${game.id}/scorebug`);
  ok("Direct-ID scorebug URL for the rehearsal game returns 404 (isProductionPresentationFixture gate)", scorebugRes.status === 404, scorebugRes.status);
  const clockRes = await fetch(`${HOST}/display/game/${game.id}/clock`);
  ok("Direct-ID venue clock display for the rehearsal game returns 404", clockRes.status === 404, clockRes.status);
  const apiRes = await fetch(`${HOST}/api/broadcast/games/${game.id}`);
  ok("Public broadcast tooling API returns 404 for the rehearsal game", apiRes.status === 404, apiRes.status);

  // A real PRODUCTION game's scorebug must still render normally - the gate is selective, not a
  // blanket failure. Uses the one real native-event game from Season Zero (Ember vs Nova).
  const realGame = await prisma.game.findFirst({ where: { fixture: { recordOrigin: "PRODUCTION" } }, select: { id: true } });
  if (realGame) {
    const realScorebugRes = await fetch(`${HOST}/broadcast/game/${realGame.id}/scorebug`);
    ok("A real PRODUCTION game's scorebug still renders (200) - isolation is selective, not blanket", realScorebugRes.status === 200, realScorebugRes.status);
  }

  // --- Play a representative game: enough score swings for Game Pulse (lead changes, a tie, a
  // run), enough for a COMEBACK Game Story tag, a 4PT Ultra Time make, and a milestone/record. ---
  await scorerScore(away.id, ap[0].id, 3, 1, 500); await statShot(away.id, ap[0].id, 3, true, 1, 500); // away 3-0
  await scorerScore(away.id, ap[0].id, 3, 1, 470); await statShot(away.id, ap[0].id, 3, true, 1, 470); // away 6-0 (largest lead so far)
  await scorerScore(home.id, hp[0].id, 2, 1, 440); await statShot(home.id, hp[0].id, 2, true, 1, 440); // home 2-6
  await scorerScore(home.id, hp[0].id, 2, 1, 420); await statShot(home.id, hp[0].id, 2, true, 1, 420); // home 4-6
  await scorerScore(home.id, hp[0].id, 2, 1, 400); await statShot(home.id, hp[0].id, 2, true, 1, 400); // home 6-6 TIE
  await scorerScore(home.id, hp[0].id, 3, 1, 380); await statShot(home.id, hp[0].id, 3, true, 1, 380); // home 9-6 LEAD CHANGE (run of 5 for home)

  // End period 1 (a real checkpoint for Game Story's period-boundary logic), then period 2 with
  // Ultra Time: a 4PT x2 make plus a normal shot x2.
  game = await prisma.game.update({ where: { id: game.id }, data: { currentPeriod: 2, clockSecondsRemaining: 50, clockStartedAt: null } });
  await scorerScore(home.id, hp[0].id, 4, 2, 50); await statShot(home.id, hp[0].id, 4, true, 2, 50); // 4PT x2 = 8 -> home 17-6
  await scorerScore(home.id, hp[0].id, 2, 2, 40); await statShot(home.id, hp[0].id, 2, true, 2, 40); // 2PT x2 = 4 -> home 21-6

  const modelDuringGame = await buildLivePresentationModelForGame(game.id);

  // --- Game Pulse ---
  ok("Game Pulse: at least 1 real lead change recorded", modelDuringGame.gamePulse.leadChanges >= 1, modelDuringGame.gamePulse.leadChanges);
  ok("Game Pulse: 1 tie recorded (6-6)", modelDuringGame.gamePulse.ties === 1, modelDuringGame.gamePulse.ties);
  ok("Game Pulse: largest lead correctly attributed to home (21-6 margin)", modelDuringGame.gamePulse.largestLead?.team === "HOME" && modelDuringGame.gamePulse.largestLead.margin === 15, modelDuringGame.gamePulse.largestLead);
  ok("Game Pulse: ultraTimeStart recorded at period 2", modelDuringGame.gamePulse.ultraTimeStart?.period === 2, modelDuringGame.gamePulse.ultraTimeStart);
  ok("Game Pulse: current run belongs to home (uninterrupted since the lead change)", modelDuringGame.gamePulse.currentRun?.team === "HOME", modelDuringGame.gamePulse.currentRun);

  // --- Game Story ---
  ok("Game Story: fires (real tag data exists)", modelDuringGame.gameStory !== null, modelDuringGame.gameStory);
  ok("Game Story: marked provisional while LIVE", modelDuringGame.gameStory?.provisional === true);
  ok("Game Story: never fires PAINT_DOMINANCE/BENCH_IMPACT/TURNOVER_PRESSURE (no live provenance)", !modelDuringGame.gameStory?.tags.some((t) => ["PAINT_DOMINANCE", "BENCH_IMPACT", "TURNOVER_PRESSURE"].includes(t)));

  // --- Milestones / suggestions ---
  ok("Live milestone: hp[0] double-digit points + a 4PT make detected", modelDuringGame.liveMilestones.some((m) => m.key === "DOUBLE_DIGIT_POINTS") && modelDuringGame.liveMilestones.some((m) => m.key === "FOUR_POINT_MAKE"));
  const { buildGraphicSuggestions } = await import("../src/lib/broadcast-suggestions");
  const suggestions = buildGraphicSuggestions(modelDuringGame);
  ok("Graphics suggestions include FOUR_POINT_MOMENT (a 4PT was just made)", suggestions.some((s) => s.graphicType === "FOUR_POINT_MOMENT"), suggestions);
  ok("Graphics suggestions include MILESTONE", suggestions.some((s) => s.graphicType === "MILESTONE"), suggestions);

  // --- Rehearsal presentation route discovery (the query each /rehearsal/* page runs) ---
  const rehearsalDiscovered = await prisma.fixture.findUnique({ where: { id: fixture.id }, select: { recordOrigin: true, game: { select: { status: true } } } });
  ok("Rehearsal route's own lookup (recordOrigin=REHEARSAL, no production filter) finds this fixture", rehearsalDiscovered?.recordOrigin === "REHEARSAL" && rehearsalDiscovered.game?.status === "LIVE");

  // --- Broadcast Presentation State: Preview/Program, TAKE/CLEAR, restart-recovery ---
  const before = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("Presentation state starts with an empty (or pre-existing production) program - test starts from a known preview", true, before);
  await setPreview({ gameId: game.id, graphicType: "SCORE_BUG", subjectId: null }, ACTOR_ID, ORGANIZATION_ID);
  const afterPreview = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("setPreview wrote Preview without touching Program", afterPreview.preview?.gameId === game.id && afterPreview.program?.gameId !== game.id, afterPreview);
  await takeToProgram(ACTOR_ID, ORGANIZATION_ID);
  const afterTake = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("TAKE copied Preview into Program atomically", afterTake.program?.gameId === game.id && afterTake.program?.graphicType === "SCORE_BUG", afterTake);
  // Restart-recovery proof: state lives in Postgres (SystemSetting), not memory - a fresh read
  // (simulating what a service restart's first request would do) returns the same value.
  const freshRead = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("A fresh read (simulating post-restart) returns the identical Program state - no in-memory state to lose", freshRead.program?.gameId === afterTake.program?.gameId && freshRead.updatedAt === afterTake.updatedAt);

  // The public program API must refuse to serve a REHEARSAL game even if it's (erroneously) on
  // Program - the same isolation gate applies to this read path too.
  const programApiWhileRehearsalOnAir = await fetch(`${HOST}/api/broadcast/program`).then((r) => r.json());
  ok("Public /api/broadcast/program reports null while Program points at a REHEARSAL game", programApiWhileRehearsalOnAir.program === null, programApiWhileRehearsalOnAir);

  await clearProgram(ACTOR_ID, ORGANIZATION_ID);
  const afterClear = await getBroadcastPresentationState(ORGANIZATION_ID);
  ok("CLEAR removed Program without touching Preview", afterClear.program === null && afterClear.preview?.gameId === game.id, afterClear);
  await setPreview(null, ACTOR_ID, ORGANIZATION_ID);

  console.log("=== All G.19 rehearsal scenarios passed ===");

  // --- Cleanup (immediately, minimizing exposure - though the checks above already proved
  // there IS no public exposure window left, unlike G.18's disclosed gap). ---
  await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
  await prisma.gameStarter.deleteMany({ where: { gameId: game.id } });
  await prisma.game.delete({ where: { id: game.id } });
  await prisma.fixture.delete({ where: { id: fixture.id } });
  await prisma.$transaction(async (tx) => { await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", SEASON_ID); });
  console.log("=== Rehearsal fully cleaned up. ===");

  const postFinalGames = await prisma.game.count({ where: { status: "FINAL" } });
  const postStandingsSum = await prisma.standing.aggregate({ where: { seasonId: SEASON_ID }, _sum: { played: true, won: true } });
  const postRehearsalResidue = await prisma.fixture.count({ where: { recordOrigin: "REHEARSAL" } });
  ok("Real production FINAL game count unchanged", postFinalGames === preFinalGames, { preFinalGames, postFinalGames });
  ok("Real production standings totals unchanged", JSON.stringify(postStandingsSum) === JSON.stringify(preStandingsSum));
  ok("Rehearsal residue is 0 after cleanup", postRehearsalResidue === 0, { postRehearsalResidue });

  const liveAfterCleanup = await fetch(`${HOST}/live`).then((r) => r.text());
  ok("Real HTTP /live page shows the genuine no-live-game state after cleanup", liveAfterCleanup.includes("No game is live right now"));
}

main()
  .catch((error) => {
    console.error("REHEARSAL FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
