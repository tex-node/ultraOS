import type { GameCore, PlayerLine } from "@/lib/analytics/types";
import {
  developmentConfig as cfg,
  DEVELOPMENT_DIMENSION_LABEL,
  roleImpactWeights,
  type Confidence,
  type DevelopmentDimensionKey,
  type PositionGroup,
} from "./config";
import { drillBlockFor, type DrillDefinition } from "./drills";
import { POSITION_GROUP_LABEL, positionGroup } from "./positions";

// Player Development Engine (ADR-011, phase C1). Pure function of season GameCores plus player
// metadata. Prescriptive by design, coach-private by rule: every Focus Area carries its Evidence,
// every dimension below its sample gate reports INSUFFICIENT_DATA instead of a recommendation.

export type PlayerMeta = { position: string | null; heightCm: number | null };

type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
type Kind = "PERCENT" | "PER_GAME";

type DimensionSpec = {
  key: DevelopmentDimensionKey;
  kind: Kind;
  direction: Direction;
  metric: string;
  metricKey: string;
};

const DIMENSIONS: DimensionSpec[] = [
  { key: "SCORING_EFFICIENCY", kind: "PERCENT", direction: "HIGHER_IS_BETTER", metric: "True shooting %", metricKey: "game.ts_pct" },
  { key: "FREE_THROWS", kind: "PERCENT", direction: "HIGHER_IS_BETTER", metric: "Free-throw %", metricKey: "game.ft_pct" },
  { key: "THREE_POINT", kind: "PERCENT", direction: "HIGHER_IS_BETTER", metric: "Three-point %", metricKey: "game.3p_pct" },
  { key: "FOUR_POINT", kind: "PERCENT", direction: "HIGHER_IS_BETTER", metric: "Four-point %", metricKey: "game.4p_pct" },
  { key: "PLAYMAKING", kind: "PER_GAME", direction: "HIGHER_IS_BETTER", metric: "Assists per game", metricKey: "game.ast_pg" },
  { key: "BALL_SECURITY", kind: "PER_GAME", direction: "LOWER_IS_BETTER", metric: "Turnovers per game", metricKey: "game.tov_pg" },
  { key: "REBOUNDING", kind: "PER_GAME", direction: "HIGHER_IS_BETTER", metric: "Rebounds per game", metricKey: "game.reb_pg" },
  { key: "DEFENSIVE_ACTIVITY", kind: "PER_GAME", direction: "HIGHER_IS_BETTER", metric: "Steals + blocks per game", metricKey: "game.stl_blk_pg" },
  { key: "FOUL_DISCIPLINE", kind: "PER_GAME", direction: "LOWER_IS_BETTER", metric: "Fouls per game", metricKey: "game.pf_pg" },
];

export type Evidence = {
  metric: string;
  playerValue: number;
  playerValueLabel: string;
  baseline: { kind: "POSITION_PEERS" | "LEAGUE"; label: string; peerCount: number; median: number; medianLabel: string };
  percentile: number;
  sample: { games: number; attempts: number | null; label: string };
  gate: string;
  confidence: Confidence;
  source: "BOX_SCORE";
};

export type Trend = { direction: "IMPROVING" | "DECLINING" | "STEADY" | "UNKNOWN"; recentValueLabel: string | null; recentGames: number };

export type Target = {
  metricKey: string;
  metric: string;
  current: number;
  target: number;
  currentLabel: string;
  targetLabel: string;
  reviewWindowGames: number;
  statement: string;
};

export type DimensionReading =
  | { dimension: DevelopmentDimensionKey; label: string; status: "OK"; evidence: Evidence; trend: Trend; priority: number }
  | { dimension: DevelopmentDimensionKey; label: string; status: "INSUFFICIENT_DATA"; sampleLabel: string; gate: string };

export type FocusArea = {
  dimension: DevelopmentDimensionKey;
  label: string;
  priority: number;
  evidence: Evidence;
  trend: Trend;
  whyItMatters: string;
  target: Target;
  drills: DrillDefinition[];
};

export type Strength = { dimension: DevelopmentDimensionKey; label: string; evidence: Evidence; note: string };

export type PlayerDevelopmentPlan = {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  seasonClubId: string;
  position: string | null;
  positionGroup: PositionGroup;
  gamesPlayed: number;
  status: "OK" | "INSUFFICIENT_DATA";
  focusAreas: FocusArea[];
  strengths: Strength[];
  readings: DimensionReading[];
};

// ---------- aggregation ----------

type Measure = { value: number; attempts: number | null; games: number } | null;

type PlayerSeason = { playerId: string; name: string; jerseyNumber: number | null; seasonClubId: string; lines: PlayerLine[] };

export function collectPlayerSeasons(games: GameCore[]): Map<string, PlayerSeason> {
  const ordered = [...games].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const map = new Map<string, PlayerSeason>();
  for (const game of ordered) {
    for (const line of game.players) {
      if (line.didNotPlay) continue;
      const existing = map.get(line.playerId);
      if (existing) {
        existing.lines.push(line);
        existing.seasonClubId = line.seasonClubId;
        existing.name = line.name;
        existing.jerseyNumber = line.jerseyNumber ?? existing.jerseyNumber;
      } else {
        map.set(line.playerId, { playerId: line.playerId, name: line.name, jerseyNumber: line.jerseyNumber, seasonClubId: line.seasonClubId, lines: [line] });
      }
    }
  }
  return map;
}

function sumPct(lines: PlayerLine[], made: (l: PlayerLine) => number | null, att: (l: PlayerLine) => number | null): Measure {
  let m = 0;
  let a = 0;
  let games = 0;
  for (const l of lines) {
    const mv = made(l);
    const av = att(l);
    if (mv == null || av == null) continue;
    m += mv;
    a += av;
    games += 1;
  }
  if (a <= 0) return { value: 0, attempts: 0, games };
  return { value: (m / a) * 100, attempts: a, games };
}

function measure(spec: DimensionSpec, lines: PlayerLine[]): Measure {
  switch (spec.key) {
    case "SCORING_EFFICIENCY": {
      let pts = 0;
      let tsa = 0;
      let games = 0;
      for (const l of lines) {
        if (l.fieldGoalsAttempted == null || l.freeThrowsAttempted == null) continue;
        pts += l.points;
        tsa += l.fieldGoalsAttempted + 0.44 * l.freeThrowsAttempted;
        games += 1;
      }
      if (tsa <= 0) return { value: 0, attempts: 0, games };
      return { value: (pts / (2 * tsa)) * 100, attempts: Math.round(tsa * 10) / 10, games };
    }
    case "FREE_THROWS":
      return sumPct(lines, (l) => l.freeThrowsMade, (l) => l.freeThrowsAttempted);
    case "THREE_POINT":
      return sumPct(lines, (l) => l.threePointsMade, (l) => l.threePointsAttempted);
    case "FOUR_POINT":
      return sumPct(lines, (l) => l.fourPointsMade, (l) => l.fourPointsAttempted);
    default: {
      const pick: Record<string, (l: PlayerLine) => number> = {
        PLAYMAKING: (l) => l.assists,
        BALL_SECURITY: (l) => l.turnovers,
        REBOUNDING: (l) => l.rebounds,
        DEFENSIVE_ACTIVITY: (l) => l.steals + l.blocks,
        FOUL_DISCIPLINE: (l) => l.fouls,
      };
      const f = pick[spec.key];
      const total = lines.reduce((s, l) => s + f(l), 0);
      return { value: lines.length > 0 ? total / lines.length : 0, attempts: null, games: lines.length };
    }
  }
}

// Scoring efficiency counts true-shooting attempts (FGA + 0.44 x FTA), which are not shot attempts a
// coach can count from a box score, so say so wherever the number is shown.
const attemptNoun = (spec: DimensionSpec) => (spec.key === "SCORING_EFFICIENCY" ? "true-shooting attempts" : "attempts");

function gateFor(spec: DimensionSpec): { ok: (m: Measure, games: number) => boolean; label: string; size: (m: Measure, games: number) => number; min: number } {
  const attemptGate = cfg.attemptGates[spec.key];
  if (spec.kind === "PERCENT" && attemptGate != null) {
    return {
      ok: (m, games) => games >= cfg.minGames && m != null && (m.attempts ?? 0) >= attemptGate,
      label: `${cfg.minGames}+ games and ${attemptGate}+ ${attemptNoun(spec)}`,
      size: (m) => m?.attempts ?? 0,
      min: attemptGate,
    };
  }
  return { ok: (_m, games) => games >= cfg.minGames, label: `${cfg.minGames}+ games`, size: (_m, games) => games, min: cfg.minGames };
}

// ---------- math helpers ----------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Mid-rank percentile: ties count half, so a league where everyone shares a value puts everyone
// at 50 instead of flagging the whole league as bottom-percentile.
export function directionalPercentile(value: number, sample: number[], direction: Direction): number {
  if (sample.length === 0) return 50;
  let better = 0;
  let equal = 0;
  for (const v of sample) {
    if (v === value) equal += 1;
    else if (direction === "HIGHER_IS_BETTER" ? v < value : v > value) better += 1;
  }
  return Math.round(((better + 0.5 * equal) / sample.length) * 100);
}

function fmt(spec: DimensionSpec, v: number): string {
  return spec.kind === "PERCENT" ? `${v.toFixed(1)}%` : v.toFixed(1);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- engine ----------

type Qualified = { playerId: string; group: PositionGroup; value: number };

function qualifiedPool(spec: DimensionSpec, seasons: Map<string, PlayerSeason>, meta: Map<string, PlayerMeta>): Qualified[] {
  const gate = gateFor(spec);
  const pool: Qualified[] = [];
  for (const ps of seasons.values()) {
    const m = measure(spec, ps.lines);
    if (!gate.ok(m, ps.lines.length) || m == null) continue;
    pool.push({ playerId: ps.playerId, group: positionGroup(meta.get(ps.playerId)?.position), value: m.value });
  }
  return pool;
}

function trendFor(spec: DimensionSpec, lines: PlayerLine[], seasonValue: number): Trend {
  const n = cfg.trend.recentGames;
  if (lines.length < n + 2) return { direction: "UNKNOWN", recentValueLabel: null, recentGames: 0 };
  const recent = measure(spec, lines.slice(-n));
  const attemptGate = cfg.attemptGates[spec.key];
  if (recent == null || (spec.kind === "PERCENT" && attemptGate != null && (recent.attempts ?? 0) < attemptGate / 2)) {
    return { direction: "UNKNOWN", recentValueLabel: null, recentGames: n };
  }
  const delta = recent.value - seasonValue;
  const meaningful = spec.kind === "PERCENT"
    ? Math.abs(delta) >= cfg.trend.percentagePoints
    : seasonValue > 0 ? Math.abs(delta) / seasonValue >= cfg.trend.perGameRelative : Math.abs(delta) >= 0.5;
  if (!meaningful) return { direction: "STEADY", recentValueLabel: fmt(spec, recent.value), recentGames: n };
  const better = spec.direction === "HIGHER_IS_BETTER" ? delta > 0 : delta < 0;
  return { direction: better ? "IMPROVING" : "DECLINING", recentValueLabel: fmt(spec, recent.value), recentGames: n };
}

function targetFor(spec: DimensionSpec, current: number, baselineMedian: number): Target {
  const window = cfg.target.reviewWindowGames;
  let target: number;
  if (spec.kind === "PERCENT") {
    const step = cfg.target.percentageStep[spec.key] ?? 4;
    target = Math.min(baselineMedian, current + step);
    if (target <= current) target = current + Math.min(step, 2);
  } else if (spec.direction === "HIGHER_IS_BETTER") {
    target = Math.min(baselineMedian, current * (1 + cfg.target.perGameStep));
    if (target <= current) target = current + 0.5;
  } else {
    target = Math.max(baselineMedian, current * (1 - cfg.target.perGameStep));
    if (target >= current) target = Math.max(0, current - 0.5);
  }
  target = round1(target);
  // Rounding must never collapse the step: "from 0.1 to 0.1" is not a target.
  const shownCurrent = round1(current);
  if (spec.direction === "HIGHER_IS_BETTER" && target <= shownCurrent) target = round1(shownCurrent + 0.1);
  else if (spec.direction === "LOWER_IS_BETTER" && target >= shownCurrent && shownCurrent > 0) target = round1(Math.max(0, shownCurrent - 0.1));
  const verb = spec.direction === "HIGHER_IS_BETTER" ? "Raise" : "Bring down";
  return {
    metricKey: spec.metricKey,
    metric: spec.metric,
    current: round1(current),
    target,
    currentLabel: fmt(spec, current),
    targetLabel: fmt(spec, target),
    reviewWindowGames: window,
    statement: `${verb} ${spec.metric.toLowerCase()} from ${fmt(spec, current)} to ${fmt(spec, target)} over the next ${window} games.`,
  };
}

function whyItMatters(spec: DimensionSpec, name: string, ev: Evidence, lines: PlayerLine[], group: PositionGroup): string {
  const peers = ev.baseline.label;
  switch (spec.key) {
    case "FREE_THROWS": {
      const fta = lines.reduce((s, l) => s + (l.freeThrowsAttempted ?? 0), 0) / Math.max(lines.length, 1);
      const lost = ((ev.baseline.median - ev.playerValue) / 100) * fta;
      return `Free throws are uncontested points. At ${ev.playerValueLabel} on ${fta.toFixed(1)} attempts per game, ${name} leaves about ${lost.toFixed(1)} points per game at the line compared with the ${peers} median (${ev.baseline.medianLabel}).`;
    }
    case "SCORING_EFFICIENCY":
      return `${name} turns possessions into points less efficiently than ${peers} (${ev.playerValueLabel} vs ${ev.baseline.medianLabel} true shooting). Better shot selection and finishing add points without needing more shots.`;
    case "THREE_POINT":
      return `Opponents can sag off a ${ev.playerValueLabel} three-point shooter, which shrinks spacing for everyone. ${peers} median is ${ev.baseline.medianLabel}.`;
    case "FOUR_POINT":
      return `Four-pointers are worth double in Ultra Time. At ${ev.playerValueLabel}, the deep shot is costing possessions; ${peers} median is ${ev.baseline.medianLabel}.`;
    case "PLAYMAKING":
      return group === "GUARD"
        ? `As a guard, ${name} is expected to create for others. ${ev.playerValueLabel} assists per game is below the ${peers} median of ${ev.baseline.medianLabel}.`
        : `${name} creates fewer shots for teammates (${ev.playerValueLabel} per game) than ${peers} (${ev.baseline.medianLabel}).`;
    case "BALL_SECURITY":
      return `Every turnover is a possession with no shot, and often an easy transition basket for the opponent. ${name} averages ${ev.playerValueLabel} against a ${peers} median of ${ev.baseline.medianLabel}.`;
    case "REBOUNDING":
      return `Rebounds end the opponent's possession or extend ours. ${name} averages ${ev.playerValueLabel} against a ${peers} median of ${ev.baseline.medianLabel}.`;
    case "DEFENSIVE_ACTIVITY":
      return `Steals and blocks create extra possessions. ${name} averages ${ev.playerValueLabel} against a ${peers} median of ${ev.baseline.medianLabel}.`;
    case "FOUL_DISCIPLINE":
      return `Fouls send opponents to the line and put ${name} at risk of sitting. ${ev.playerValueLabel} per game against a ${peers} median of ${ev.baseline.medianLabel}.`;
  }
}

function strengthNote(spec: DimensionSpec, name: string, ev: Evidence): string {
  return `${name} is in the ${ev.percentile}th percentile of ${ev.baseline.label} for ${spec.metric.toLowerCase()} (${ev.playerValueLabel}). Build plays that use it.`;
}

export function buildPlayerDevelopmentPlan(
  playerId: string,
  games: GameCore[],
  meta: Map<string, PlayerMeta>,
  seasons: Map<string, PlayerSeason> = collectPlayerSeasons(games),
): PlayerDevelopmentPlan | null {
  const ps = seasons.get(playerId);
  if (!ps) return null;
  const pMeta = meta.get(playerId);
  const group = positionGroup(pMeta?.position);
  const gamesPlayed = ps.lines.length;
  const readings: DimensionReading[] = [];

  for (const spec of DIMENSIONS) {
    const gate = gateFor(spec);
    const m = measure(spec, ps.lines);
    const label = DEVELOPMENT_DIMENSION_LABEL[spec.key];
    if (m == null || !gate.ok(m, gamesPlayed)) {
      const att = m?.attempts;
      const sampleLabel = spec.kind === "PERCENT" ? `${gamesPlayed} games, ${Math.round(att ?? 0)} ${attemptNoun(spec)}` : `${gamesPlayed} games`;
      readings.push({ dimension: spec.key, label, status: "INSUFFICIENT_DATA", sampleLabel, gate: gate.label });
      continue;
    }
    const pool = qualifiedPool(spec, seasons, meta);
    const peers = group === "UNKNOWN" ? [] : pool.filter((q) => q.group === group);
    const usePeers = peers.length >= cfg.minPeers;
    const sample = (usePeers ? peers : pool).map((q) => q.value);
    const baselineMedian = median(sample);
    const percentile = directionalPercentile(m.value, sample, spec.direction);
    const size = gate.size(m, gamesPlayed);
    const confidence: Confidence = size >= gate.min * cfg.highConfidenceMultiplier ? "HIGH" : "MEDIUM";
    const evidence: Evidence = {
      metric: spec.metric,
      playerValue: round1(m.value),
      playerValueLabel: fmt(spec, m.value),
      baseline: {
        kind: usePeers ? "POSITION_PEERS" : "LEAGUE",
        label: usePeers ? `league ${POSITION_GROUP_LABEL[group].toLowerCase()}` : "the league",
        peerCount: sample.length,
        median: round1(baselineMedian),
        medianLabel: fmt(spec, baselineMedian),
      },
      percentile,
      sample: {
        games: gamesPlayed,
        attempts: m.attempts,
        label: spec.kind === "PERCENT" ? `${Math.round(m.attempts ?? 0)} ${attemptNoun(spec)} over ${m.games} games` : `${gamesPlayed} games`,
      },
      gate: gate.label,
      confidence,
      source: "BOX_SCORE",
    };
    const gap = Math.max(0, cfg.focusBelowPercentile - percentile) / cfg.focusBelowPercentile;
    const priority = round1(gap * roleImpactWeights[group][spec.key] * cfg.confidenceWeight[confidence] * 100) / 100;
    readings.push({ dimension: spec.key, label, status: "OK", evidence, trend: trendFor(spec, ps.lines, m.value), priority });
  }

  const ok = readings.filter((r): r is Extract<DimensionReading, { status: "OK" }> => r.status === "OK");
  const specOf = (k: DevelopmentDimensionKey) => DIMENSIONS.find((d) => d.key === k)!;

  const focusAreas: FocusArea[] = ok
    .filter((r) => r.evidence.percentile < cfg.focusBelowPercentile && r.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.evidence.percentile - b.evidence.percentile)
    .slice(0, cfg.maxFocusAreas)
    .map((r) => {
      const spec = specOf(r.dimension);
      return {
        dimension: r.dimension,
        label: r.label,
        priority: r.priority,
        evidence: r.evidence,
        trend: r.trend,
        whyItMatters: whyItMatters(spec, ps.name, r.evidence, ps.lines, group),
        target: targetFor(spec, r.evidence.playerValue, r.evidence.baseline.median),
        drills: drillBlockFor(r.dimension, r.evidence.percentile, cfg.drillsPerFocusArea),
      };
    });

  const strengths: Strength[] = ok
    .filter((r) => r.evidence.percentile >= cfg.strengthAtOrAbovePercentile)
    .sort((a, b) => b.evidence.percentile * roleImpactWeights[group][b.dimension] - a.evidence.percentile * roleImpactWeights[group][a.dimension])
    .slice(0, cfg.maxStrengths)
    .map((r) => ({ dimension: r.dimension, label: r.label, evidence: r.evidence, note: strengthNote(specOf(r.dimension), ps.name, r.evidence) }));

  return {
    playerId,
    name: ps.name,
    jerseyNumber: ps.jerseyNumber,
    seasonClubId: ps.seasonClubId,
    position: pMeta?.position ?? null,
    positionGroup: group,
    gamesPlayed,
    status: ok.length === 0 ? "INSUFFICIENT_DATA" : "OK",
    focusAreas,
    strengths,
    readings,
  };
}

// Every player who appeared for the club this season, ordered by games played then name.
export function buildSquadDevelopmentPlans(games: GameCore[], seasonClubId: string, meta: Map<string, PlayerMeta>): PlayerDevelopmentPlan[] {
  const seasons = collectPlayerSeasons(games);
  const plans: PlayerDevelopmentPlan[] = [];
  for (const ps of seasons.values()) {
    if (ps.seasonClubId !== seasonClubId) continue;
    const plan = buildPlayerDevelopmentPlan(ps.playerId, games, meta, seasons);
    if (plan) plans.push(plan);
  }
  return plans.sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));
}
