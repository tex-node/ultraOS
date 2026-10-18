import type { GameCore, PlayerLine } from "@/lib/analytics/types";
import { developmentConfig as cfg, roleImpactWeights } from "./config";
import { positionGroup, POSITION_GROUP_LABEL } from "./positions";
import {
  collectPlayerSeasons,
  DEVELOPMENT_DIMENSIONS,
  dimensionGate,
  directionalPercentile,
  measureDimension,
  passesMinutesGate,
  qualifiedDimensionPool,
  type Measure,
  type PlayerMeta,
  type PlayerSeason,
} from "./player-development";
import type { GamePlan } from "./game-plan";

// Player Selection / Rotation Advisor (P15 I2-b, deliverable 1). Pure: a squad, its season games, the
// C2 game plan for the opponent and (optionally) recent workload in; a ranked rotation out.
//
// Design decisions, all deliberate:
//
// 1. FORM IS C1's FRAMEWORK OVER A SHORTER WINDOW, not a new composite. It reuses the same nine
//    dimensions, the same attempt/minutes gates and the same "position peers, else league" baseline
//    rule (qualifiedDimensionPool + cfg.minPeers), measuring the last FIVE games instead of the
//    season. A separate "form formula" would drift from the development plan's readings.
//    formScore is the role-weighted mean percentile (roleImpactWeights) over the dimensions that
//    cleared their gates in the window; formConfidence is HIGH only when the window itself has
//    minGames and every included dimension's sample is at least 2x its gate (cfg.highConfidenceMultiplier).
//
// 2. MATCHUP IS C2's ASSIGNMENTS, NOT A NEW MODEL. The game plan already decides who defends whom
//    (assignments[].defender, with .alternatives). The advisor scores: being assigned to a threat,
//    the position-group match against that threat, and the threat's scoring weight; a player whose
//    position group matches an UNCOVERED threat is a candidate to cover it. It degrades in steps -
//    see MatchupState - rather than pretending either side has positions it lacks.
//
// 3. AVAILABILITY is fouls per 36 minutes, percentile-ranked against the same qualified pool
//    (LOWER_IS_BETTER). Always computed; a player with no minutes recorded gets a neutral 50 and
//    says so in the evidence rather than scoring 0.
//
// 4. LOAD is games played in the last 14 days (plus reported workload minutes when I3 supplies
//    them). Heavy load LOWERS the score: this is a freshness signal, not a quality signal, which is
//    why it is weighted lowest and never triggers BENCH on its own. The optional workload input
//    (deliverable from I3) is additive: absent, the component is computed from games alone.
//
// 5. OVERALL is the weighted mean of the non-null components, RENORMALIZED over them, so a missing
//    matchup (no plan, or no positions) does not silently drag everyone down by 30%.
//
// 6. RECOMMENDATION IS RANK-BASED, not threshold-based: a coach starts five (Ultra's format), and a
//    threshold ("overall >= 70 = START") would produce four starters on a weak night or seven on a
//    good one. The top `starterCount` (default 5, capped at the squad size) are START, the next
//    ROTATE_WINDOW (3) are ROTATE, the rest BENCH. Only players with a qualifying sample are ranked
//    above players without one, but nobody is dropped from the list - a coach needs to see everyone.
//
// 7. WHY NOT: every candidate except the last carries the case AGAINST picking them over the next
//    ranked player - the component they trail on and the component they lead on. Last-ranked gets
//    null (there is no "next" to prefer). This is the same "show your working" rule C1/C2 follow.

export type SelectionRecommendation = "START" | "ROTATE" | "BENCH";
export type MatchupState = "OK" | "DEGRADED" | "INSUFFICIENT_DATA";

// Same shape C1/C2 use for "here is why". Imported by consumers for display; kept structurally
// identical to player-development.ts's Evidence so the UI can render either.
export type SelectionEvidence = {
  metric: string;
  playerValue: number;
  playerValueLabel: string;
  baseline: { kind: "POSITION_PEERS" | "LEAGUE"; label: string; peerCount: number; median: number; medianLabel: string };
  percentile: number;
  sample: { games: number; attempts: number | null; label: string };
  gate: string;
  confidence: "HIGH" | "MEDIUM";
  source: "BOX_SCORE";
};

export interface SelectionCandidate {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  position: string | null;
  heightCm: number | null;
}

export interface SelectionCandidateResult {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  position: string | null;
  positionGroup: "GUARD" | "WING" | "BIG" | "UNKNOWN";
  gamesPlayed: number;
  minutesPerGame: number;
  // Always computed (see 1 above).
  formScore: number;
  formConfidence: "HIGH" | "MEDIUM";
  // Null exactly when there is nothing position-based to compare (see 2 above).
  matchupScore: number | null;
  matchupState: MatchupState;
  // Always computed.
  availabilityScore: number;
  loadScore: number;
  overallScore: number;
  recommendation: SelectionRecommendation;
  evidence: SelectionEvidence[];
  whyNot: string | null;
}

export interface SelectionWorkload {
  playerId: string;
  minutesLast7Days: number;
  gamesLast7Days: number;
}

export interface BuildSelectionAdviceInput {
  games: GameCore[];
  squad: SelectionCandidate[];
  plan?: GamePlan | null;
  opponentName?: string | null;
  workload?: SelectionWorkload[] | null;
  // Injected so "last 14 days" is deterministic in tests; defaults to now.
  now?: Date;
  starterCount?: number;
}

export interface SelectionAdvice {
  status: "OK" | "INSUFFICIENT_DATA";
  insufficientReason: string | null;
  // Per-squad position coverage - the per-squad guard the roadmap requires. Null when the squad is
  // empty (nothing to advise on at all).
  squadPositionCoverage: { usable: number; total: number } | null;
  matchupState: MatchupState;
  starterCount: number;
  candidates: SelectionCandidateResult[];
  notes: string[];
}

// Weights sum to 1 when every component is present; renormalized otherwise (decision 5).
export const SELECTION_WEIGHTS = { form: 0.5, matchup: 0.3, availability: 0.12, load: 0.08 } as const;
export const FORM_WINDOW_GAMES = 5;
export const LOAD_WINDOW_DAYS = 14;
export const ROTATE_WINDOW = 3;
const DEFAULT_STARTERS = 5;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

function playedLines(ps: PlayerSeason): PlayerLine[] {
  return ps.lines.filter((l) => !l.didNotPlay);
}

function minutesFor(lines: PlayerLine[]): number {
  return sum(lines.map((l) => l.minutesPlayed));
}

function windowOf(ps: PlayerSeason, n: number): PlayerLine[] {
  return playedLines(ps).slice(-n);
}

type FormOutcome = { score: number; confidence: "HIGH" | "MEDIUM"; evidence: SelectionEvidence };

function scoreForm(
  ps: PlayerSeason,
  seasons: Map<string, PlayerSeason>,
  meta: Map<string, PlayerMeta>,
): FormOutcome {
  const window = windowOf(ps, FORM_WINDOW_GAMES);
  const group = positionGroup(meta.get(ps.playerId)?.position);
  const weights = roleImpactWeights[group];
  const seasonGameCount = ps.lines.length;

  let weighted = 0;
  let weightSum = 0;
  const percents: number[] = [];
  let highConfidence = window.length >= cfg.minGames;
  const baselinesUsed: { kind: "POSITION_PEERS" | "LEAGUE"; peerCount: number; median: number }[] = [];

  for (const spec of DEVELOPMENT_DIMENSIONS) {
    // The per-game dimensions are minute-sensitive: a player below the minutes share is not
    // assessed on them, exactly as C1 does.
    if (spec.kind === "PER_GAME" && !passesMinutesGate(ps)) continue;
    const measure = measureDimension(spec, window);
    const gate = dimensionGate(spec);
    if (!gate.ok(measure as Measure, window.length)) continue;

    const pool = qualifiedDimensionPool(spec, seasons, meta).filter((q) => q.playerId !== ps.playerId);
    const positionPeers = pool.filter((q) => q.group === group);
    const usePeers = positionPeers.length >= cfg.minPeers && group !== "UNKNOWN";
    const baseline = usePeers ? positionPeers : pool;
    if (baseline.length === 0) continue;

    const percentile = directionalPercentile(measure!.value, baseline.map((q) => q.value), spec.direction);
    const weight = weights[spec.key] ?? 1;
    weighted += percentile * weight;
    weightSum += weight;
    percents.push(percentile);
    baselinesUsed.push({ kind: usePeers ? "POSITION_PEERS" : "LEAGUE", peerCount: baseline.length, median: medianOf(baseline.map((q) => q.value)) });

    const gateSample = gate.size(measure as Measure, window.length);
    if (gateSample < gate.min * cfg.highConfidenceMultiplier) highConfidence = false;
  }

  const hasSample = weightSum > 0;
  const score = hasSample ? clamp(round(weighted / weightSum)) : 0;
  const confidence: "HIGH" | "MEDIUM" = hasSample && highConfidence && percents.length >= 2 ? "HIGH" : "MEDIUM";

  // Evidence: report the window's aggregate, and be explicit when the window is too small to have one.
  const kind = baselinesUsed.length > 0 && baselinesUsed.every((b) => b.kind === "POSITION_PEERS") ? "POSITION_PEERS" : "LEAGUE";
  const peerCount = baselinesUsed.length > 0 ? Math.max(...baselinesUsed.map((b) => b.peerCount)) : 0;
  const median = baselinesUsed.length > 0 ? round(mean(baselinesUsed.map((b) => b.median))) : 50;
  const evidence: SelectionEvidence = {
    metric: `Role-weighted form, last ${FORM_WINDOW_GAMES} games (${percents.length} of ${DEVELOPMENT_DIMENSIONS.length} dimensions)`,
    playerValue: score,
    playerValueLabel: hasSample ? `${score} (percentile mean, weighted for ${POSITION_GROUP_LABEL[group] ?? group})` : "no qualifying sample",
    baseline: {
      kind,
      label: kind === "POSITION_PEERS" ? `${POSITION_GROUP_LABEL[group] ?? group} peers` : "League",
      peerCount,
      median,
      medianLabel: `${median}`,
    },
    percentile: score,
    sample: { games: window.length, attempts: null, label: `${window.length} of ${seasonGameCount} games in the window` },
    gate: hasSample ? `${cfg.minGames}+ games in the window, per-dimension attempt gates` : `no dimension cleared its gate in the last ${FORM_WINDOW_GAMES} games`,
    confidence,
    source: "BOX_SCORE",
  };
  return { score, confidence, evidence };
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

type MatchupOutcome = { score: number | null; state: MatchupState; note: string; evidence: SelectionEvidence | null };

function scoreMatchup(
  candidate: SelectionCandidate,
  plan: GamePlan | null | undefined,
  squadCoverage: { usable: number; total: number },
): MatchupOutcome {
  const group = positionGroup(candidate.position);
  if (!plan || plan.status !== "OK" || plan.assignments.length === 0) {
    return { score: null, state: "INSUFFICIENT_DATA", note: "No game plan for this opponent yet.", evidence: null };
  }
  if (squadCoverage.usable === 0) {
    return { score: null, state: "INSUFFICIENT_DATA", note: "This squad has no recorded positions, so no assignment can be matched to a position.", evidence: null };
  }

  const assignments = plan.assignments;
  const threatPositionsKnown = assignments.filter((a) => positionGroup(a.threat.position) !== "UNKNOWN").length;
  const state: MatchupState = threatPositionsKnown === 0 ? "DEGRADED" : "OK";
  const positionMatters = state === "OK";

  const assignment = assignments.find((a) => a.defender?.playerId === candidate.playerId);
  const uncovered = assignments.filter((a) => !a.defender);

  let score: number;
  let metric: string;
  let label: string;
  let sampleLabel: string;

  if (assignment) {
    const threatGroup = positionGroup(assignment.threat.position);
    const match = positionMatters && group !== "UNKNOWN" && threatGroup === group;
    score = 60 + (match ? 20 : 0) + clamp(assignment.threat.ppg * 2, 0, 20);
    metric = "Defensive assignment";
    label = `assigned to #${assignment.threat.jerseyNumber ?? "-"} ${assignment.threat.name} (${assignment.threat.ppg.toFixed(1)} ppg)${match ? ", position match" : positionMatters ? ", position mismatch" : ""}`;
    sampleLabel = assignment.reasons[0] ?? "assigned in the game plan";
  } else {
    // Not assigned: is there an uncovered threat this player's position group could take?
    const couldCover = uncovered
      .filter((a) => positionMatters && group !== "UNKNOWN" && positionGroup(a.threat.position) === group)
      .sort((a, b) => b.threat.ppg - a.threat.ppg)[0];
    if (couldCover) {
      score = 45 + clamp(couldCover.threat.ppg * 1.5, 0, 20);
      metric = "Uncovered opponent threat";
      label = `could cover #${couldCover.threat.jerseyNumber ?? "-"} ${couldCover.threat.name} (${couldCover.threat.ppg.toFixed(1)} ppg) - currently unassigned`;
      sampleLabel = "no defender in the game plan";
    } else {
      score = positionMatters && group !== "UNKNOWN" ? 30 : 25;
      metric = "Defensive assignment";
      label = "no matching assignment or uncovered threat for this position group";
      sampleLabel = "game plan assignments";
    }
  }

  const evidence: SelectionEvidence = {
    metric,
    playerValue: clamp(round(score)),
    playerValueLabel: label,
    baseline: { kind: "LEAGUE", label: `Opponent: ${plan.opponent.name}`, peerCount: assignments.length, median: round(mean(assignments.map((a) => a.threat.ppg))), medianLabel: `${mean(assignments.map((a) => a.threat.ppg)).toFixed(1)} ppg` },
    percentile: clamp(round(score)),
    sample: { games: plan.opponent.games, attempts: null, label: sampleLabel },
    gate: positionMatters ? "positions recorded on both sides" : "threat positions not recorded - assignment only",
    confidence: state === "OK" ? "HIGH" : "MEDIUM",
    source: "BOX_SCORE",
  };
  return { score: clamp(round(score)), state, note: "", evidence };
}

function scoreAvailability(ps: PlayerSeason, seasons: Map<string, PlayerSeason>, meta: Map<string, PlayerMeta>): { score: number; evidence: SelectionEvidence } {
  const lines = playedLines(ps);
  const minutes = minutesFor(lines);
  const fouls = sum(lines.map((l) => l.fouls));
  const group = positionGroup(meta.get(ps.playerId)?.position);
  const pool: number[] = [];
  for (const other of seasons.values()) {
    const otherLines = playedLines(other);
    const m = minutesFor(otherLines);
    if (m <= 0) continue;
    if (positionGroup(meta.get(other.playerId)?.position) !== group) continue;
    pool.push((sum(otherLines.map((l) => l.fouls)) / m) * 36);
  }

  if (minutes <= 0) {
    return {
      score: 50,
      evidence: {
        metric: "Fouls per 36 minutes",
        playerValue: 0,
        playerValueLabel: "not applicable - no minutes recorded",
        baseline: { kind: "POSITION_PEERS", label: `${POSITION_GROUP_LABEL[group] ?? group} peers`, peerCount: pool.length, median: 0, medianLabel: "n/a" },
        percentile: 50,
        sample: { games: lines.length, attempts: null, label: "no minutes recorded" },
        gate: "1+ minute recorded",
        confidence: "MEDIUM",
        source: "BOX_SCORE",
      },
    };
  }

  const per36 = (fouls / minutes) * 36;
  // LOWER_IS_BETTER: fewer fouls per 36 => higher percentile => higher availability.
  const percentile = directionalPercentile(per36, pool, "LOWER_IS_BETTER");
  return {
    score: clamp(round(percentile)),
    evidence: {
      metric: "Fouls per 36 minutes",
      playerValue: Math.round(per36 * 10) / 10,
      playerValueLabel: `${per36.toFixed(1)} per 36 min`,
      baseline: {
        kind: "POSITION_PEERS",
        label: `${POSITION_GROUP_LABEL[group] ?? group} peers`,
        peerCount: pool.length,
        median: medianOf(pool),
        medianLabel: `${medianOf(pool).toFixed(1)}`,
      },
      percentile: clamp(round(percentile)),
      sample: { games: lines.length, attempts: null, label: `${fouls} fouls in ${minutes} minutes` },
      gate: "1+ minute recorded",
      confidence: lines.length >= cfg.minGames ? "HIGH" : "MEDIUM",
      source: "BOX_SCORE",
    },
  };
}

function scoreLoad(
  candidate: SelectionCandidate,
  games: GameCore[],
  workload: SelectionWorkload[] | null | undefined,
  now: Date,
): { score: number; evidence: SelectionEvidence } {
  const windowStart = now.getTime() - LOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // Both ends of the window: a fixture scheduled for next week is not load carried this week.
  const recentGames = games.filter((g) => {
    const at = new Date(g.scheduledAt).getTime();
    return at >= windowStart && at <= now.getTime() && g.players.some((p) => p.playerId === candidate.playerId && !p.didNotPlay);
  }).length;
  const reported = workload?.find((w) => w.playerId === candidate.playerId);
  const minutesPenalty = reported ? reported.minutesLast7Days / 8 : 0;
  // 10 points per game in the window, plus reported minutes / 8: 0 games = 100 (fresh), 3 = 70,
  // 6 = 40, 10 = 0. Steep enough that a tournament weekend registers, but NOT saturating at zero
  // after five games - a busy league would otherwise have every player tied at 0 and the component
  // would stop distinguishing anything (found by a test that expected two 6-game players to differ).
  const score = clamp(100 - 10 * recentGames - minutesPenalty);
  const label = reported
    ? `${recentGames} games in ${LOAD_WINDOW_DAYS} days + ${reported.minutesLast7Days} reported minutes in 7 days`
    : `${recentGames} games in ${LOAD_WINDOW_DAYS} days`;
  return {
    score,
    evidence: {
      metric: "Recent load",
      playerValue: recentGames,
      playerValueLabel: `${recentGames} game${recentGames === 1 ? "" : "s"} in ${LOAD_WINDOW_DAYS} days`,
      baseline: { kind: "LEAGUE", label: "Squad", peerCount: 0, median: 0, medianLabel: "n/a" },
      percentile: round(score),
      sample: { games: recentGames, attempts: null, label },
      gate: reported ? "games + reported workload" : "games only (no workload data)",
      confidence: reported ? "HIGH" : "MEDIUM",
      source: "BOX_SCORE",
    },
  };
}

function describeGap(a: SelectionCandidateResult, b: SelectionCandidateResult): string {
  const components: { key: string; label: string; mine: number | null; theirs: number | null }[] = [
    { key: "form", label: "form", mine: a.formScore, theirs: b.formScore },
    { key: "matchup", label: "matchup", mine: a.matchupScore, theirs: b.matchupScore },
    { key: "availability", label: "foul discipline", mine: a.availabilityScore, theirs: b.availabilityScore },
    { key: "load", label: "freshness", mine: a.loadScore, theirs: b.loadScore },
  ];
  const comparable = components.filter((c) => c.mine != null && c.theirs != null) as { key: string; label: string; mine: number; theirs: number }[];
  const ahead = [...comparable].sort((x, y) => y.mine - y.theirs - (x.mine - x.theirs)).filter((c) => c.mine > c.theirs)[0];
  const behind = [...comparable].sort((x, y) => y.theirs - y.mine - (x.theirs - x.mine)).filter((c) => c.theirs > c.mine)[0];
  const name = `#${b.jerseyNumber ?? "-"} ${b.name}`;
  const aheadPart = ahead ? `you are stronger on ${ahead.label} (${ahead.mine} vs ${ahead.theirs})` : "no component favours you";
  const behindPart = behind ? `they lead on ${behind.label} (${behind.theirs} vs ${behind.mine})` : "they do not lead on any component";
  return `${name} is next (overall ${b.overallScore} vs ${a.overallScore}): ${behindPart}; ${aheadPart}.`;
}

export function buildSelectionAdvice(input: BuildSelectionAdviceInput): SelectionAdvice {
  const { games, squad, plan, workload } = input;
  const now = input.now ?? new Date();
  const notes: string[] = [];
  const usable = squad.filter((p) => positionGroup(p.position) !== "UNKNOWN").length;

  if (squad.length === 0) {
    return {
      status: "INSUFFICIENT_DATA",
      insufficientReason: "No squad available for this fixture.",
      squadPositionCoverage: null,
      matchupState: "INSUFFICIENT_DATA",
      starterCount: 0,
      candidates: [],
      notes,
    };
  }

  const squadCoverage = { usable, total: squad.length };
  const seasons = collectPlayerSeasons(games);
  const meta = new Map<string, PlayerMeta>(
    squad.map((p) => [p.playerId, { position: p.position, heightCm: p.heightCm }]),
  );
  // Players who have not appeared this season still need a form row; give collectPlayerSeasons'
  // output the meta it lacks by merging squad players with no lines.
  for (const candidate of squad) {
    if (!seasons.has(candidate.playerId)) {
      seasons.set(candidate.playerId, {
        playerId: candidate.playerId,
        name: candidate.name,
        jerseyNumber: candidate.jerseyNumber,
        seasonClubId: "",
        lines: [],
        minutesShares: [],
        minutes: [],
      });
    }
  }

  const scored = squad.map((candidate): SelectionCandidateResult => {
    const ps = seasons.get(candidate.playerId)!;
    const form = scoreForm(ps, seasons, meta);
    const matchup = scoreMatchup(candidate, plan, squadCoverage);
    const availability = scoreAvailability(ps, seasons, meta);
    const load = scoreLoad(candidate, games, workload, now);

    const present: { value: number; weight: number }[] = [
      { value: form.score, weight: SELECTION_WEIGHTS.form },
      ...(matchup.score != null ? [{ value: matchup.score, weight: SELECTION_WEIGHTS.matchup }] : []),
      { value: availability.score, weight: SELECTION_WEIGHTS.availability },
      { value: load.score, weight: SELECTION_WEIGHTS.load },
    ];
    const weightSum = sum(present.map((p) => p.weight));
    const overallScore = clamp(round(sum(present.map((p) => p.value * p.weight)) / weightSum));

    const evidence: SelectionEvidence[] = [form.evidence, availability.evidence, load.evidence];
    if (matchup.evidence) evidence.splice(1, 0, matchup.evidence);

    const lines = playedLines(ps);
    return {
      playerId: candidate.playerId,
      name: candidate.name,
      jerseyNumber: candidate.jerseyNumber,
      position: candidate.position,
      positionGroup: positionGroup(candidate.position),
      gamesPlayed: ps.lines.length,
      minutesPerGame: lines.length > 0 ? Math.round((minutesFor(lines) / lines.length) * 10) / 10 : 0,
      formScore: form.score,
      formConfidence: form.confidence,
      matchupScore: matchup.score,
      matchupState: matchup.state,
      availabilityScore: availability.score,
      loadScore: load.score,
      overallScore,
      recommendation: "BENCH" as SelectionRecommendation,
      evidence,
      whyNot: null,
    };
  });

  // Rank: players with a real form sample first, then by overall, then by form.
  const ranked = [...scored].sort(
    (a, b) =>
      Number(b.formScore > 0) - Number(a.formScore > 0) ||
      b.overallScore - a.overallScore ||
      b.formScore - a.formScore ||
      (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999),
  );

  const starterCount = Math.min(input.starterCount ?? DEFAULT_STARTERS, ranked.length);
  ranked.forEach((candidate, index) => {
    candidate.recommendation = index < starterCount ? "START" : index < starterCount + ROTATE_WINDOW ? "ROTATE" : "BENCH";
  });
  for (let i = 0; i < ranked.length - 1; i += 1) ranked[i].whyNot = describeGap(ranked[i], ranked[i + 1]);

  const matchupState = ranked[0]?.matchupState ?? "INSUFFICIENT_DATA";
  if (matchupState === "INSUFFICIENT_DATA") notes.push("Matchup is excluded from every overall score: no opponent game plan or no recorded positions.");
  else if (matchupState === "DEGRADED") notes.push("Matchup is based on assignments only: the opponent's threat positions are not recorded.");
  if (squadCoverage && squadCoverage.usable < squadCoverage.total) {
    notes.push(`${squadCoverage.total - squadCoverage.usable} of ${squadCoverage.total} squad players have no recorded position (squad setup page fixes this).`);
  }
  if (ranked.every((c) => c.formScore === 0)) notes.push("No player has a qualifying sample yet - form is 0 for everyone and the ranking is effectively neutral.");

  return {
    status: ranked.some((c) => c.formScore > 0) ? "OK" : "INSUFFICIENT_DATA",
    insufficientReason: ranked.some((c) => c.formScore > 0) ? null : "Not enough recorded games for any player in this squad.",
    squadPositionCoverage: squadCoverage,
    matchupState,
    starterCount,
    candidates: ranked,
    notes,
  };
}
