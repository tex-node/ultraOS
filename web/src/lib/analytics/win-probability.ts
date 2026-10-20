// Live win probability (streak v12, Prompt 2).
//
// A pure function of the game state and the sport: no database, no clock reads, no randomness. That matters because
// a sportsbook partner is going to compare two polls of the same game and expect the number to move only when the
// game does.
//
// The models are deliberately simple and each one is named in the output, so a partner can tell WHICH model produced
// the number:
//
//   CLOCK_SCORE  - clock sports (basketball, football, american football): a logistic on the margin, with the
//                  scale shrinking as the clock runs down, so a 1-point lead with 2 seconds left is ~97% and the
//                  same lead at the start of the game is ~52%.
//   SET_SCORE    - tennis and volleyball: sets won first, then the point differential in the current set.
//   CHASE        - cricket's second innings: required run rate against the rate being scored. This is the only
//                  model where a side can be losing on runs and still be favoured.
//   PRIOR        - before a ball is bowled: the caller's historical win rate, used as-is, or 50/50.
//   FINAL        - the result, with no uncertainty left.
//
// Nothing here ever claims certainty during play: a live model is clamped to [0.02, 0.98], because "100%" on a live
// game is a statement the engine cannot support. FINAL is the only source of exactly 1 or 0.

export type WinProbabilityMethod = "CLOCK_SCORE" | "SET_SCORE" | "CHASE" | "PRIOR" | "FINAL";

export type WinProbabilityInput = {
  sportKey: string;
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "FINAL" | string;
  homeScore: number;
  awayScore: number;
  /** 1-based period/quarter/half/innings. */
  period: number;
  periodCount: number;
  /** Seconds left in the current period, when the sport has a clock. */
  clockSecondsRemaining?: number | null;
  /** Length of one period in seconds, when the sport has a clock. */
  periodDurationSeconds?: number | null;
  /** Set sports only: points needed to win the current set, and the points scored in it. */
  pointsToWinPeriod?: number | null;
  currentPoints?: { home: number; away: number } | null;
  /** Cricket only: runs still needed and balls still available in the chase. */
  runsNeeded?: number | null;
  ballsRemaining?: number | null;
  /** Both innings' run rates, when known. */
  currentRunRate?: number | null;
  requiredRunRate?: number | null;
  /** Pre-match expectation, 0..1 for the home side. */
  priorHomeWin?: number | null;
  drawsAllowed?: boolean;
};

export type WinProbability = {
  home: number;
  away: number;
  method: WinProbabilityMethod;
  /** 0..1: how much the number is grounded in played data rather than a prior. */
  confidence: number;
  /** One short sentence a partner can log next to the number. */
  reason: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// A live game is never certain: the clamp lives here so every live model inherits it (FINAL is the only exact answer).
const live = (value: number) => clamp(value, 0.02, 0.98);
const logistic = (value: number) => 1 / (1 + Math.exp(-value));

// Margin-to-probability scale per sport: roughly "how many points of lead make you a clear favourite". Basketball
// swings on 10, football (soccer) on 1.6 goals, american football on 9 points.
const CLOCK_SCALE: Record<string, number> = {
  BASKETBALL: 10,
  FOOTBALL: 1.6,
  AMERICAN_FOOTBALL: 9,
  HANDBALL: 6,
  BASEBALL: 2.2,
};
const DEFAULT_CLOCK_SCALE = 8;

function normalise(homeHome: number, method: WinProbabilityMethod, confidence: number, reason: string): WinProbability {
  const home = clamp(homeHome, 0, 1);
  return { home: round(home), away: round(1 - home), method, confidence: round(confidence), reason };
}
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The result is the result: no model, no uncertainty. A draw is 50/50 for sports that allow one and would be a
 * contradiction for sports that do not, so those return the leader at 1 and the trailer at 0.
 */
function finalResult(input: WinProbabilityInput): WinProbability {
  if (input.homeScore === input.awayScore) {
    if (input.drawsAllowed === false) {
      // The engine should never finalise a level game for a no-draw sport; if it somehow sees one, say so with 50/50
      // rather than inventing a winner.
      return normalise(0.5, "FINAL", 1, "Final, level (a no-draw sport should not have ended here)");
    }
    return normalise(0.5, "FINAL", 1, "Final, drawn");
  }
  return normalise(input.homeScore > input.awayScore ? 1 : 0, "FINAL", 1, `Final, ${input.homeScore}-${input.awayScore}`);
}

/** Cricket's second innings: the chase is decided by the rate the batting side needs against the rate it is scoring. */
function chaseProbability(input: WinProbabilityInput): WinProbability | null {
  if (input.period < 2) return null;
  const runsNeeded = input.runsNeeded;
  const ballsRemaining = input.ballsRemaining;
  if (runsNeeded === null || runsNeeded === undefined || ballsRemaining === null || ballsRemaining === undefined) return null;
  if (runsNeeded <= 0) return normalise(0.999, "CHASE", 0.98, "Target already passed");
  if (ballsRemaining <= 0) return normalise(0, "CHASE", 0.98, "No balls left, target not reached");

  const required = input.requiredRunRate ?? (runsNeeded / (ballsRemaining / 6));
  const current = input.currentRunRate ?? required;
  // In this engine the home side bats first, so the CHASING side is the away side: the logistic gives the chaser's
  // chance of getting there, and the home side gets the complement.
  const chaserChance = live(logistic((current - required) / 1.6));
  return normalise(1 - chaserChance, "CHASE", 0.7, `${runsNeeded} needed off ${ballsRemaining} balls (RRR ${required.toFixed(2)} vs ${current.toFixed(2)})`);
}

/** Tennis and volleyball: sets first, then how close the current set is to its target. */
function setProbability(input: WinProbabilityInput): WinProbability | null {
  const target = input.pointsToWinPeriod;
  const points = input.currentPoints;
  if (!target || !points) return null;
  const setsAhead = input.homeScore - input.awayScore;
  const setsToWin = Math.floor(input.periodCount / 2) + 1;
  const setsLeft = Math.max(1, setsToWin - Math.max(input.homeScore, input.awayScore));
  // A set lead is worth roughly a set's worth of certainty, diluted by how many sets remain.
  const setTerm = (setsAhead / (setsLeft + 0.5)) * 1.25;
  // The current set's differential, normalised by how close it is to being won.
  const pointTerm = ((points.home - points.away) / Math.max(1, target)) * 1.1;
  const probability = live(logistic(setTerm + pointTerm));
  return normalise(probability, "SET_SCORE", 0.65, `Sets ${input.homeScore}-${input.awayScore}, set points ${points.home}-${points.away}`);
}

/** Clock sports: margin against the amount of game left. */
function clockProbability(input: WinProbabilityInput): WinProbability | null {
  const scale = CLOCK_SCALE[input.sportKey] ?? DEFAULT_CLOCK_SCALE;
  const margin = input.homeScore - input.awayScore;
  const periodDuration = input.periodDurationSeconds ?? 0;
  const clock = input.clockSecondsRemaining;

  // Time left as a fraction of the whole game. A sport without a clock source still gets a model, based on how far
  // through its periods it is - but its confidence is marked down below.
  let fraction: number;
  if (clock !== null && clock !== undefined && periodDuration > 0) {
    const periodsLeft = Math.max(0, input.periodCount - input.period);
    fraction = (clock + periodsLeft * periodDuration) / (input.periodCount * periodDuration);
  } else {
    fraction = Math.max(0.05, (input.periodCount - input.period + 1) / (input.periodCount + 1));
  }
  fraction = clamp(fraction, 0, 1);

  // The scale shrinks with the time left: a 10-point lead with 2 minutes gone is worth much less than the same lead
  // with 2 minutes left. At fraction 0 the scale is tiny, so any lead is decisive.
  const effectiveScale = scale * Math.sqrt(Math.max(fraction, 0.002));
  const homeEdge = 0.03; // a small, fixed home advantage; not a model of the venue, just a prior nudge
  const probability = live(logistic((margin + homeEdge) / effectiveScale));
  const confidence = clamp(0.45 + (1 - fraction) * 0.45, 0.45, 0.92);
  return normalise(probability, "CLOCK_SCORE", confidence, `Margin ${margin > 0 ? "+" : ""}${margin}, ${Math.round(fraction * 100)}% of the game left`);
}

export function calculateWinProbability(input: WinProbabilityInput): WinProbability {
  if (input.status === "FINAL") return finalResult(input);

  if (input.status === "SCHEDULED" || (input.period <= 0 && input.homeScore === 0 && input.awayScore === 0)) {
    const prior = input.priorHomeWin;
    if (prior !== null && prior !== undefined && Number.isFinite(prior)) {
      return normalise(prior, "PRIOR", 0.2, `Pre-match prior ${(prior * 100).toFixed(1)}%`);
    }
    return normalise(0.5, "PRIOR", 0.1, "No played data and no prior: 50/50");
  }

  const chase = chaseProbability(input);
  if (chase) return chase;

  const set = setProbability(input);
  if (set) return set;

  const clock = clockProbability(input);
  if (clock) return clock;

  return normalise(0.5, "PRIOR", 0.1, "No model applies to this state");
}
