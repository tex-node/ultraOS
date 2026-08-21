// Live Game Story (G.19, Part VI-VII). Reuses the existing historical Game Story engine
// (analytics/game-story.ts's classifyGameStory()) against a live-derived GameCore-shaped view -
// deliberately not a second Story engine. Advanced TeamStat fields the live event-derived engine
// cannot compute (benchPoints, pointsInPaint, pointsFromTurnovers - see event-derived-stats.ts,
// which only ever populates these from an official PDF import) are left null on purpose:
// classifyGameStory() already null-guards every tag that needs them, so BENCH_IMPACT/
// PAINT_DOMINANCE/TURNOVER_PRESSURE simply never fire live rather than firing on fabricated
// zeros - "only emit tags with sufficient provenance" (Part VII) falls out of that null-guard
// for free, without live-game-story.ts needing its own copy of the rule.
import { FINAL_PERIOD } from "./game-rules";
import { classifyGameStory, type GameStoryInput } from "./analytics/game-story";
import type { GameStoryTag, PeriodScoreLine, TeamSideStats } from "./analytics/types";
import type { LiveGameSnapshotV2 } from "./live-game-snapshot-v2";
import type { PulsePoint } from "./live-game-pulse";

function liveStoryPeriodLabel(period: number): string {
  if (period < FINAL_PERIOD) return "HALF 1";
  if (period === FINAL_PERIOD) return "HALF 2";
  return `OT${period - FINAL_PERIOD}`;
}

// A period only counts as a checkpoint once it has genuinely ended (a later period has scoring,
// or the game is FINAL) - the in-progress period's running score is not a period boundary yet,
// and treating it as one would let COMEBACK/SECOND_HALF_TAKEOVER fire on a still-changing number.
function buildLivePeriods(points: PulsePoint[], currentPeriod: number, isFinal: boolean): PeriodScoreLine[] {
  const lastPointByPeriod = new Map<number, PulsePoint>();
  for (const point of points) lastPointByPeriod.set(point.period, point);
  return [...lastPointByPeriod.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([period]) => period < currentPeriod || isFinal)
    .map(([period, point]) => ({ period, label: liveStoryPeriodLabel(period), homeScore: point.homeScore, awayScore: point.awayScore }));
}

// Per-side "biggest lead ever held" - the one TeamSideStats field classifyGameStory needs
// (WIRE_TO_WIRE) that isn't already on LiveGameSnapshotV2's team box score, but IS fully
// derivable from the same scoring chronology Game Pulse already walks.
function biggestLeadFor(points: PulsePoint[], side: "HOME" | "AWAY"): number {
  let max = 0;
  for (const point of points) {
    const margin = Math.abs(point.homeScore - point.awayScore);
    const holder = point.homeScore > point.awayScore ? "HOME" : point.awayScore > point.homeScore ? "AWAY" : null;
    if (holder === side && margin > max) max = margin;
  }
  return max;
}

function toLiveTeamSideStats(
  team: LiveGameSnapshotV2["teams"]["home"],
  boxTeam: LiveGameSnapshotV2["liveBoxScore"]["teams"]["home"],
  score: number,
  biggestLead: number,
): TeamSideStats {
  return {
    seasonClubId: team.seasonClubId, shortName: team.shortName, name: team.name, logoUrl: null, primaryColor: null,
    score,
    rebounds: boxTeam.rebounds, assists: boxTeam.assists, turnovers: boxTeam.turnovers, fouls: boxTeam.fouls,
    fieldGoalsMade: boxTeam.fieldGoalsMade, fieldGoalsAttempted: boxTeam.fieldGoalsAttempted,
    twoPointsMade: null, twoPointsAttempted: null, threePointsMade: null, threePointsAttempted: null,
    freeThrowsMade: null, freeThrowsAttempted: null,
    offensiveRebounds: boxTeam.offensiveRebounds, defensiveRebounds: boxTeam.defensiveRebounds,
    pointsFromTurnovers: null, pointsInPaint: null, pointsInPaintMade: null, pointsInPaintAttempted: null,
    secondChancePoints: null, fastBreakPoints: null, fastBreakPointsFromTurnovers: null, benchPoints: null,
    biggestLead, biggestScoringRun: null, pointsPerPossession: null,
    leadChanges: null, timesTied: null, timeWithLeadSeconds: null,
    fourPointsMade: boxTeam.fourPointsMade, fourPointsAttempted: boxTeam.fourPointsAttempted,
    ultraTimePointsFor: null, ultraTimePointsAgainst: null,
  };
}

export function buildLiveGameCore(snapshot: LiveGameSnapshotV2, pulsePoints: PulsePoint[]): GameStoryInput {
  const isFinal = snapshot.status === "FINAL";
  return {
    home: toLiveTeamSideStats(snapshot.teams.home, snapshot.liveBoxScore.teams.home, snapshot.score.home, biggestLeadFor(pulsePoints, "HOME")),
    away: toLiveTeamSideStats(snapshot.teams.away, snapshot.liveBoxScore.teams.away, snapshot.score.away, biggestLeadFor(pulsePoints, "AWAY")),
    periods: buildLivePeriods(pulsePoints, snapshot.period, isFinal),
  };
}

export type LiveGameStory = {
  tags: GameStoryTag[];
  facts: string[];
  provisional: boolean;
};

// Deterministic facts (Part VII) - plain templates over already-validated numbers, no runtime
// LLM, no prediction/emotional language. Distinct from the historical buildGameStorySummary()
// because that reads FG%/benchPoints fields the live engine doesn't populate.
function buildLiveFacts(core: GameStoryInput, tags: GameStoryTag[]): string[] {
  const facts: string[] = [];
  const winner = core.home.score >= core.away.score ? core.home : core.away;
  const loser = winner === core.home ? core.away : core.home;

  if (tags.includes("COMEBACK")) {
    const reg = core.periods.filter((p) => !/^OT/i.test(p.label));
    const deficit = Math.max(0, ...reg.slice(0, -1).map((p) => {
      const winnerCum = winner === core.home ? p.homeScore : p.awayScore;
      const loserCum = winner === core.home ? p.awayScore : p.homeScore;
      return loserCum - winnerCum;
    }));
    if (deficit > 0) facts.push(`${winner.shortName} has erased a ${deficit}-point deficit.`);
  }
  if (core.home.rebounds !== core.away.rebounds) {
    const [leader, hi, lo] = core.home.rebounds > core.away.rebounds
      ? [core.home, core.home.rebounds, core.away.rebounds]
      : [core.away, core.away.rebounds, core.home.rebounds];
    if (hi > 0) facts.push(`${leader.shortName} leads the rebounding battle ${hi}–${lo}.`);
  }
  if (winner.fourPointsMade != null && winner.fourPointsMade > 0) {
    facts.push(`${winner.shortName} has made ${winner.fourPointsMade} 4PT shot${winner.fourPointsMade === 1 ? "" : "s"}.`);
  }
  if (tags.includes("CLOSE_GAME")) {
    facts.push(`${winner.shortName} leads ${loser.shortName} by ${Math.abs(core.home.score - core.away.score)}.`);
  }
  return facts;
}

export function buildLiveGameStory(snapshot: LiveGameSnapshotV2, pulsePoints: PulsePoint[]): LiveGameStory | null {
  const core = buildLiveGameCore(snapshot, pulsePoints);
  const tags = classifyGameStory(core);
  if (tags.length === 0) return null;
  const isFinal = snapshot.status === "FINAL";
  const verified = snapshot.verification.verifiedAt !== null;
  return {
    tags,
    facts: buildLiveFacts(core, tags),
    // "PROVISIONAL" until FINAL + VERIFIED (Part VI/XLVI) - mirrors canPromoteToOfficialRecord's
    // exact gate in live-presentation-model.ts, never a second promotion rule.
    provisional: !(isFinal && verified),
  };
}
