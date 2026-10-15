import type { GameCore, PeriodScoreLine, PlayerLine, TeamSideStats } from "@/lib/analytics/types";
import { gamePlanConfig as cfg, type Confidence } from "./config";
import { collectPlayerSeasons, type PlayerMeta } from "./player-development";
import { positionGroup } from "./positions";

// Opponent Game Plan Engine (ADR-011, phase C2). Pure function of season GameCores. Builds a
// prescriptive plan for a focus club against one opponent: Keys to the Game, defensive
// assignments, a late-game / Ultra Time plan, and "how they beat us" (the same rules run with the
// roles swapped). Every key carries Evidence and a machine-checkable `check` so the post-game
// review can say HELD / BROKEN / NOT_TESTABLE without anyone re-reading prose.

// ---------- team profiles ----------

type Acc = { sum: number; n: number };
type TeamProfile = {
  seasonClubId: string;
  name: string;
  shortName: string;
  games: number;
  stats: Map<string, Acc>;
};

function add(p: TeamProfile, key: string, v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return;
  const a = p.stats.get(key) ?? { sum: 0, n: 0 };
  a.sum += v;
  a.n += 1;
  p.stats.set(key, a);
}

function addPair(p: TeamProfile, made: string, att: string, m: number | null | undefined, a: number | null | undefined) {
  if (m == null || a == null) return;
  add(p, made, m);
  add(p, att, a);
}

const perGame = (p: TeamProfile | undefined, key: string): number | null => {
  const a = p?.stats.get(key);
  return a && a.n > 0 ? a.sum / a.n : null;
};
const total = (p: TeamProfile | undefined, key: string): number => p?.stats.get(key)?.sum ?? 0;
const pct = (p: TeamProfile | undefined, made: string, att: string): number | null => {
  const at = total(p, att);
  return at > 0 ? (total(p, made) / at) * 100 : null;
};

// Regulation periods only (OT excluded); first half = first ceil(n/2) regulation periods.
function halfMargins(periods: PeriodScoreLine[], isHome: boolean): { first: number; second: number } | null {
  const reg = periods.filter((p) => !/^OT/i.test(p.label)).sort((a, b) => a.period - b.period);
  if (reg.length < 2) return null;
  const cut = Math.ceil(reg.length / 2);
  const margin = (ps: PeriodScoreLine[]) => ps.reduce((s, p) => s + (isHome ? p.homeScore - p.awayScore : p.awayScore - p.homeScore), 0);
  return { first: margin(reg.slice(0, cut)), second: margin(reg.slice(cut)) };
}

// TeamStat has no three-point or free-throw columns and game-analytics leaves those team fields
// null, so derive them from the side's player lines when every player who played reports the field.
type ShootingField = "threePointsMade" | "threePointsAttempted" | "freeThrowsMade" | "freeThrowsAttempted";
function sideTotal(side: TeamSideStats, players: PlayerLine[], field: ShootingField): number | null {
  const own = side[field];
  if (own != null) return own;
  const rows = players.filter((p) => p.seasonClubId === side.seasonClubId && !p.didNotPlay);
  if (rows.length === 0 || rows.some((p) => p[field] == null)) return null;
  return rows.reduce((sum, p) => sum + (p[field] as number), 0);
}

function teamSteals(players: PlayerLine[], seasonClubId: string): number {
  return players.filter((p) => p.seasonClubId === seasonClubId && !p.didNotPlay).reduce((s, p) => s + p.steals, 0);
}

export function buildTeamProfiles(games: GameCore[]): Map<string, TeamProfile> {
  const map = new Map<string, TeamProfile>();
  for (const g of games) {
    for (const [side, opp, isHome] of [[g.home, g.away, true], [g.away, g.home, false]] as [TeamSideStats, TeamSideStats, boolean][]) {
      const p = map.get(side.seasonClubId) ?? { seasonClubId: side.seasonClubId, name: side.name, shortName: side.shortName, games: 0, stats: new Map() };
      p.games += 1;
      add(p, "pf", side.score);
      add(p, "pa", opp.score);
      add(p, "to", side.turnovers);
      add(p, "forcedTo", opp.turnovers);
      add(p, "fouls", side.fouls);
      add(p, "oreb", side.offensiveRebounds);
      add(p, "orebAllowed", opp.offensiveRebounds);
      add(p, "stl", teamSteals(g.players, side.seasonClubId));
      add(p, "bench", side.benchPoints);
      add(p, "fga", side.fieldGoalsAttempted);
      const tpa = sideTotal(side, g.players, "threePointsAttempted");
      addPair(p, "tpm", "tpa", sideTotal(side, g.players, "threePointsMade"), tpa);
      addPair(p, "ftm", "fta", sideTotal(side, g.players, "freeThrowsMade"), sideTotal(side, g.players, "freeThrowsAttempted"));
      addPair(p, "oppTpm", "oppTpa", sideTotal(opp, g.players, "threePointsMade"), sideTotal(opp, g.players, "threePointsAttempted"));
      if (side.fieldGoalsAttempted != null && tpa != null) {
        add(p, "fgaForRate", side.fieldGoalsAttempted);
        add(p, "tpaForRate", tpa);
      }
      add(p, "utFor", side.ultraTimePointsFor);
      add(p, "utAgainst", side.ultraTimePointsAgainst);
      const halves = halfMargins(g.periods, isHome);
      if (halves) {
        add(p, "h1", halves.first);
        add(p, "h2", halves.second);
      }
      map.set(side.seasonClubId, p);
    }
  }
  return map;
}

// League mean of team per-game rates, over teams with enough games.
function leagueMean(profiles: Map<string, TeamProfile>, key: string): number | null {
  const vals = [...profiles.values()].filter((p) => p.games >= 2).map((p) => perGame(p, key)).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ---------- types ----------

export type KeyKind =
  | "DENY_FOCAL_POINT"
  | "FOUL_POOR_FT_SHOOTER"
  | "PRESSURE_THE_BALL"
  | "PROTECT_THE_BALL"
  | "CRASH_OFFENSIVE_GLASS"
  | "PACK_THE_PAINT"
  | "RUN_THEM_OFF_THE_LINE"
  | "CONTROL_TEMPO"
  | "ATTACK_FOUL_TROUBLE"
  | "WIN_THE_SECOND_HALF"
  | "BUILD_EARLY_LEAD";

export type KeyEvidence = { metric: string; value: string; baseline: string; sample: string };

// What the post-game review measures. `side` is relative to the plan's focus club.
export type KeyCheck = {
  stat: "PLAYER_POINTS" | "PLAYER_FTA_SHARE" | "PLAYER_FOULS" | "TEAM_TO" | "TEAM_OREB" | "TEAM_3P_PCT" | "TEAM_3PA" | "TEAM_POINTS" | "SECOND_HALF_MARGIN" | "FIRST_HALF_MARGIN";
  side: "FOCUS" | "OPPONENT";
  playerId?: string;
  baseline: number;
  want: "BELOW" | "ABOVE";
};

export type PlayerRef = { playerId: string; name: string; jerseyNumber: number | null };

export type KeyToTheGame = {
  kind: KeyKind;
  title: string;
  rationale: string;
  subject: PlayerRef | null;
  evidence: KeyEvidence[];
  confidence: Confidence;
  strength: number;
  check: KeyCheck;
};

export type DefensiveAssignment = {
  threat: PlayerRef & { ppg: number; position: string | null };
  defender: (PlayerRef & { position: string | null }) | null;
  reasons: string[];
  alternatives: PlayerRef[];
};

export type CloserRole = { role: "FREE_THROWS" | "THREE_POINT" | "FOUR_POINT"; player: PlayerRef; value: string; sample: string };

export type LateGamePlan = {
  ultraTimeDataAvailable: boolean;
  ultraTime: { focusForPerGame: number | null; focusAgainstPerGame: number | null; opponentForPerGame: number | null; opponentAgainstPerGame: number | null } | null;
  closers: CloserRole[];
  deny: PlayerRef | null;
  foulTarget: (PlayerRef & { ftPct: string; sample: string }) | null;
  notes: string[];
};

export type HeadToHeadSummary = { games: number; focusWins: number; focusLosses: number; results: { scheduledAt: Date; focusScore: number; opponentScore: number }[] };

export type GamePlan = {
  focus: { seasonClubId: string; name: string; games: number };
  opponent: { seasonClubId: string; name: string; games: number };
  status: "OK" | "INSUFFICIENT_DATA";
  insufficientReason: string | null;
  keys: KeyToTheGame[];
  howTheyBeatUs: KeyToTheGame[];
  assignments: DefensiveAssignment[];
  lateGame: LateGamePlan | null;
  headToHead: HeadToHeadSummary;
  defenseNote: string;
};

// ---------- player season helpers ----------

type PlayerSeason = ReturnType<typeof collectPlayerSeasons> extends Map<string, infer V> ? V : never;

const ref = (p: { playerId: string; name: string; jerseyNumber: number | null }): PlayerRef => ({ playerId: p.playerId, name: p.name, jerseyNumber: p.jerseyNumber });
const sumL = (lines: PlayerLine[], f: (l: PlayerLine) => number | null) => lines.reduce((s, l) => s + (f(l) ?? 0), 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const f1 = (v: number) => v.toFixed(1);
const fp = (v: number) => `${v.toFixed(1)}%`;
const label = (p: PlayerRef) => `${p.jerseyNumber != null ? `#${p.jerseyNumber} ` : ""}${p.name}`;

function rosterOf(seasons: Map<string, PlayerSeason>, seasonClubId: string): PlayerSeason[] {
  return [...seasons.values()].filter((p) => p.seasonClubId === seasonClubId);
}

function confidenceFromGames(games: number): Confidence {
  return games >= cfg.highConfidenceGames ? "HIGH" : "MEDIUM";
}

// ---------- key rules ----------

// Rules are written from the attacker's point of view: "how `us` beats `them`". The focus plan
// runs them as (focus, opponent); "how they beat us" runs them as (opponent, focus).
function keysFor(
  us: TeamProfile,
  them: TeamProfile,
  profiles: Map<string, TeamProfile>,
  seasons: Map<string, PlayerSeason>,
  usIsFocus: boolean,
): KeyToTheGame[] {
  const keys: KeyToTheGame[] = [];
  const conf = confidenceFromGames(Math.min(us.games, them.games));
  const sideThem: KeyCheck["side"] = usIsFocus ? "OPPONENT" : "FOCUS";
  const sideUs: KeyCheck["side"] = usIsFocus ? "FOCUS" : "OPPONENT";
  const sample = `${them.name}: ${them.games} games`;
  const themRoster = rosterOf(seasons, them.seasonClubId).filter((p) => p.lines.length >= cfg.minPlayerGames);
  const themPoints = total(them, "pf");

  // 1. Focal point
  const scorers = [...themRoster].sort((a, b) => sumL(b.lines, (l) => l.points) - sumL(a.lines, (l) => l.points));
  const top = scorers[0];
  if (top && themPoints > 0) {
    const share = sumL(top.lines, (l) => l.points) / themPoints;
    if (share >= cfg.focalUsageShare) {
      const ppg = sumL(top.lines, (l) => l.points) / top.lines.length;
      keys.push({
        kind: "DENY_FOCAL_POINT",
        title: `Take away ${label(ref(top))}`,
        rationale: `${top.name} scores ${fp(share * 100)} of ${them.name}'s points. Show early help, deny their favourite catches and make someone else beat ${usIsFocus ? "us" : "them"}.`,
        subject: ref(top),
        evidence: [{ metric: "Share of team points", value: fp(share * 100), baseline: `${fp(cfg.focalUsageShare * 100)} threshold`, sample: `${top.lines.length} games, ${f1(ppg)} PPG` }],
        confidence: confidenceFromGames(top.lines.length),
        strength: share / cfg.focalUsageShare,
        check: { stat: "PLAYER_POINTS", side: sideThem, playerId: top.playerId, baseline: r1(ppg), want: "BELOW" },
      });
    }
  }

  // 2. Poor free-throw shooter who gets real minutes
  const ftCandidates = themRoster
    .map((p) => ({ p, fta: sumL(p.lines, (l) => l.freeThrowsAttempted), ftm: sumL(p.lines, (l) => l.freeThrowsMade) }))
    .filter((x) => x.fta >= cfg.poorFtMinAttempts && (x.ftm / x.fta) * 100 < cfg.poorFtPct)
    .sort((a, b) => a.ftm / a.fta - b.ftm / b.fta);
  const worstFt = ftCandidates[0];
  if (worstFt) {
    const ftPct = (worstFt.ftm / worstFt.fta) * 100;
    const themFta = total(them, "fta");
    const share = themFta > 0 ? worstFt.fta / themFta : 0;
    keys.push({
      kind: "FOUL_POOR_FT_SHOOTER",
      title: `When you must foul, foul ${label(ref(worstFt.p))}`,
      rationale: `${worstFt.p.name} shoots ${fp(ftPct)} from the line. Late in the game or in the bonus, send ${worstFt.p.name} to the line instead of their shooters.`,
      subject: ref(worstFt.p),
      evidence: [{ metric: "Free-throw %", value: fp(ftPct), baseline: `${cfg.poorFtPct}% threshold`, sample: `${worstFt.fta} attempts over ${worstFt.p.lines.length} games` }],
      confidence: worstFt.fta >= cfg.poorFtMinAttempts * 2 ? "HIGH" : "MEDIUM",
      strength: (cfg.poorFtPct - ftPct) / 10 + 1,
      check: { stat: "PLAYER_FTA_SHARE", side: sideThem, playerId: worstFt.p.playerId, baseline: r1(share * 100), want: "ABOVE" },
    });
  }

  // 3. Pressure the ball / 4. protect the ball
  const lgTo = leagueMean(profiles, "to");
  const themTo = perGame(them, "to");
  if (lgTo && themTo != null && themTo >= lgTo * cfg.highRatio) {
    const usStl = perGame(us, "stl");
    const lgStl = leagueMean(profiles, "stl");
    const ourEdge = usStl != null && lgStl ? usStl / lgStl : 1;
    keys.push({
      kind: "PRESSURE_THE_BALL",
      title: "Pressure the ball",
      rationale: `${them.name} turn it over ${f1(themTo)} times a game (league ${f1(lgTo)}). Pick up full court and trap the corners.${ourEdge >= cfg.highRatio ? ` Our ${f1(usStl!)} steals a game make this a strength-on-weakness matchup.` : ""}`,
      subject: null,
      evidence: [{ metric: "Their turnovers per game", value: f1(themTo), baseline: `league ${f1(lgTo)}`, sample }],
      confidence: conf,
      strength: (themTo / lgTo) * (ourEdge >= cfg.highRatio ? 1.2 : 1),
      check: { stat: "TEAM_TO", side: sideThem, baseline: r1(themTo), want: "ABOVE" },
    });
  }
  const themForced = perGame(them, "forcedTo");
  const lgForced = leagueMean(profiles, "forcedTo");
  const usTo = perGame(us, "to");
  if (lgForced && themForced != null && themForced >= lgForced * cfg.highRatio && usTo != null) {
    keys.push({
      kind: "PROTECT_THE_BALL",
      title: "Value every possession",
      rationale: `${them.name} force ${f1(themForced)} turnovers a game (league ${f1(lgForced)}). Strong two-hand passes, jump stops in traffic, and don't pick up the dribble against their traps.`,
      subject: null,
      evidence: [
        { metric: "Turnovers they force per game", value: f1(themForced), baseline: `league ${f1(lgForced)}`, sample },
        { metric: `${us.name} turnovers per game`, value: f1(usTo), baseline: lgTo ? `league ${f1(lgTo)}` : "—", sample: `${us.name}: ${us.games} games` },
      ],
      confidence: conf,
      strength: themForced / lgForced,
      check: { stat: "TEAM_TO", side: sideUs, baseline: r1(usTo), want: "BELOW" },
    });
  }

  // 5. Offensive glass
  const themOrebAllowed = perGame(them, "orebAllowed");
  const lgOrebAllowed = leagueMean(profiles, "orebAllowed");
  const usOreb = perGame(us, "oreb");
  if (lgOrebAllowed && themOrebAllowed != null && themOrebAllowed >= lgOrebAllowed * cfg.highRatio && usOreb != null) {
    keys.push({
      kind: "CRASH_OFFENSIVE_GLASS",
      title: "Crash the offensive glass",
      rationale: `${them.name} give up ${f1(themOrebAllowed)} offensive rebounds a game (league ${f1(lgOrebAllowed)}). Send two to the glass on every shot.`,
      subject: null,
      evidence: [{ metric: "Offensive rebounds they allow per game", value: f1(themOrebAllowed), baseline: `league ${f1(lgOrebAllowed)}`, sample }],
      confidence: conf,
      strength: themOrebAllowed / lgOrebAllowed,
      check: { stat: "TEAM_OREB", side: sideUs, baseline: r1(usOreb), want: "ABOVE" },
    });
  }

  // 6/7. Three-point profile
  const fgaR = total(them, "fgaForRate");
  const rate = fgaR > 0 ? (total(them, "tpaForRate") / fgaR) * 100 : null;
  const tp = pct(them, "tpm", "tpa");
  const tpaPg = perGame(them, "tpa");
  // Must clear the absolute volume bar AND take more threes than the league's typical team, so a
  // league where everyone shoots a lot of threes doesn't flag every opponent.
  const lgRates = [...profiles.values()]
    .filter((p) => p.games >= 2 && total(p, "fgaForRate") > 0)
    .map((p) => (total(p, "tpaForRate") / total(p, "fgaForRate")) * 100);
  const lgRate = lgRates.length ? lgRates.reduce((a, b) => a + b, 0) / lgRates.length : null;
  if (rate != null && tp != null && tpaPg != null && lgRate != null && rate >= cfg.threeRateHigh && rate > lgRate) {
    if (tp < cfg.threePctWeak) {
      keys.push({
        kind: "PACK_THE_PAINT",
        title: "Pack the paint, live with their threes",
        rationale: `${fp(rate)} of their shots are threes but only ${fp(tp)} go in. Sag off non-shooters and protect the rim.`,
        subject: null,
        evidence: [{ metric: "Their 3PA rate / 3P%", value: `${fp(rate)} / ${fp(tp)}`, baseline: `league 3PA rate ${fp(lgRate)}; ${cfg.threePctWeak}% make-rate threshold`, sample }],
        confidence: conf,
        strength: 1 + (cfg.threePctWeak - tp) / 10,
        check: { stat: "TEAM_3P_PCT", side: sideThem, baseline: r1(tp), want: "BELOW" },
      });
    } else if (tp >= cfg.threePctStrong) {
      keys.push({
        kind: "RUN_THEM_OFF_THE_LINE",
        title: "Run them off the three-point line",
        rationale: `${fp(rate)} of their shots are threes and they hit ${fp(tp)}. Close out high, switch handoffs and make them put it on the floor.`,
        subject: null,
        evidence: [{ metric: "Their 3PA rate / 3P%", value: `${fp(rate)} / ${fp(tp)}`, baseline: `league 3PA rate ${fp(lgRate)}; ${cfg.threePctStrong}% threshold`, sample }],
        confidence: conf,
        strength: 1 + (tp - cfg.threePctStrong) / 10,
        check: { stat: "TEAM_3PA", side: sideThem, baseline: r1(tpaPg), want: "BELOW" },
      });
    }
  }

  // 8. Tempo
  const lgPf = leagueMean(profiles, "pf");
  const themPf = perGame(them, "pf");
  if (lgPf && themPf != null && themPf >= lgPf * cfg.highRatio) {
    keys.push({
      kind: "CONTROL_TEMPO",
      title: "Control the tempo",
      rationale: `${them.name} score ${f1(themPf)} a game (league ${f1(lgPf)}). Get back in transition, use the shot clock, and don't trade quick possessions.`,
      subject: null,
      evidence: [{ metric: "Their points per game", value: f1(themPf), baseline: `league ${f1(lgPf)}`, sample }],
      confidence: conf,
      strength: themPf / lgPf,
      check: { stat: "TEAM_POINTS", side: sideThem, baseline: r1(themPf), want: "BELOW" },
    });
  }

  // 9. Foul trouble among their main rotation
  const rotation = [...themRoster].sort((a, b) => b.lines.length - a.lines.length || sumL(b.lines, (l) => l.points) - sumL(a.lines, (l) => l.points)).slice(0, 6);
  const foulProne = rotation
    .map((p) => ({ p, fpg: sumL(p.lines, (l) => l.fouls) / p.lines.length }))
    .filter((x) => x.fpg >= cfg.foulTroublePerGame)
    .sort((a, b) => b.fpg - a.fpg)[0];
  if (foulProne) {
    keys.push({
      kind: "ATTACK_FOUL_TROUBLE",
      title: `Attack ${label(ref(foulProne.p))} early`,
      rationale: `${foulProne.p.name} averages ${f1(foulProne.fpg)} fouls a game. Drive at ${foulProne.p.name} from the opening possessions to force early foul trouble.`,
      subject: ref(foulProne.p),
      evidence: [{ metric: "Fouls per game", value: f1(foulProne.fpg), baseline: `${cfg.foulTroublePerGame} threshold`, sample: `${foulProne.p.lines.length} games` }],
      confidence: confidenceFromGames(foulProne.p.lines.length),
      strength: foulProne.fpg / cfg.foulTroublePerGame,
      check: { stat: "PLAYER_FOULS", side: sideThem, playerId: foulProne.p.playerId, baseline: r1(foulProne.fpg), want: "ABOVE" },
    });
  }

  // 10/11. Half splits
  const h1 = perGame(them, "h1");
  const h2 = perGame(them, "h2");
  if (h1 != null && h2 != null && (them.stats.get("h2")?.n ?? 0) >= cfg.minOpponentGames) {
    if (h2 <= -cfg.halfMarginSwing) {
      keys.push({
        kind: "WIN_THE_SECOND_HALF",
        title: "Stay close, they fade late",
        rationale: `${them.name} are ${f1(h2)} per game in second halves. Keep it within reach at half-time and push the pace after the break.`,
        subject: null,
        evidence: [{ metric: "Their second-half margin per game", value: f1(h2), baseline: `±${cfg.halfMarginSwing} threshold`, sample }],
        confidence: conf,
        strength: Math.abs(h2) / cfg.halfMarginSwing,
        check: { stat: "SECOND_HALF_MARGIN", side: sideUs, baseline: 0, want: "ABOVE" },
      });
    } else if (h2 >= cfg.halfMarginSwing) {
      keys.push({
        kind: "BUILD_EARLY_LEAD",
        title: "Build the lead before half-time",
        rationale: `${them.name} win second halves by ${f1(h2)} per game. Start fast and don't rely on a late comeback.`,
        subject: null,
        evidence: [{ metric: "Their second-half margin per game", value: `+${f1(h2)}`, baseline: `±${cfg.halfMarginSwing} threshold`, sample }],
        confidence: conf,
        strength: h2 / cfg.halfMarginSwing,
        check: { stat: "FIRST_HALF_MARGIN", side: sideUs, baseline: 0, want: "ABOVE" },
      });
    }
  }

  const weight = (k: KeyToTheGame) => k.strength * (k.confidence === "HIGH" ? 1 : 0.8);
  return keys.sort((a, b) => weight(b) - weight(a)).slice(0, cfg.maxKeys);
}

// ---------- defensive assignments ----------

function buildAssignments(
  focusRoster: PlayerSeason[],
  oppRoster: PlayerSeason[],
  meta: Map<string, PlayerMeta>,
): DefensiveAssignment[] {
  const defenders = focusRoster.filter((p) => p.lines.length >= cfg.minPlayerGames);
  const activity = new Map(defenders.map((d) => [d.playerId, sumL(d.lines, (l) => l.steals + l.blocks) / d.lines.length]));
  const actValues = [...activity.values()];
  const actPct = (v: number) => (actValues.length ? actValues.filter((x) => x < v).length / actValues.length : 0.5);

  const threats = oppRoster
    .filter((p) => p.lines.length >= cfg.minPlayerGames)
    .map((p) => ({ p, ppg: sumL(p.lines, (l) => l.points) / p.lines.length }))
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, cfg.threatsToAssign);

  const used = new Set<string>();
  return threats.map(({ p, ppg }) => {
    const tMeta = meta.get(p.playerId);
    const tGroup = positionGroup(tMeta?.position);
    const scored = defenders
      .map((d) => {
        const dMeta = meta.get(d.playerId);
        const reasons: string[] = [];
        const a = activity.get(d.playerId) ?? 0;
        let score = actPct(a);
        reasons.push(`${f1(a)} steals + blocks per game`);
        if (tGroup !== "UNKNOWN" && positionGroup(dMeta?.position) === tGroup) {
          score += 0.5;
          reasons.push(`same position group (${dMeta?.position})`);
        }
        if (tMeta?.heightCm && dMeta?.heightCm) {
          const diff = dMeta.heightCm - tMeta.heightCm;
          if (Math.abs(diff) <= 5) {
            score += 0.3;
            reasons.push("matching height");
          } else if (diff > 5) {
            score += 0.15;
            reasons.push(`${diff} cm taller`);
          }
        }
        const fpg = sumL(d.lines, (l) => l.fouls) / d.lines.length;
        if (fpg >= cfg.foulTroublePerGame) {
          score -= 0.3;
          reasons.push(`foul risk: ${f1(fpg)} fouls per game`);
        }
        return { d, score, reasons, position: dMeta?.position ?? null };
      })
      .sort((x, y) => y.score - x.score || x.d.name.localeCompare(y.d.name));
    const pick = scored.find((s) => !used.has(s.d.playerId)) ?? null;
    if (pick) used.add(pick.d.playerId);
    return {
      threat: { ...ref(p), ppg: r1(ppg), position: tMeta?.position ?? null },
      defender: pick ? { ...ref(pick.d), position: pick.position } : null,
      reasons: pick ? pick.reasons : ["No defender with enough games played."],
      alternatives: scored.filter((s) => s !== pick).slice(0, 2).map((s) => ref(s.d)),
    };
  });
}

// ---------- late game ----------

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type Shooter = { p: PlayerSeason; m: number; a: number };

// A closer is the focus club's best qualified shooter, but only if that player is at or above the
// league median for the stat. "Best of a weak group" is not a closer, and naming one would
// contradict the Development Plan that flags the same player for the same skill.
function bestShooter(
  roster: PlayerSeason[],
  everyone: PlayerSeason[],
  made: (l: PlayerLine) => number | null,
  att: (l: PlayerLine) => number | null,
  minAtt: number,
): { pick: Shooter | undefined; ownQualified: number; leagueMedian: number | null } {
  const qualified = (players: PlayerSeason[]): Shooter[] => players.map((p) => ({ p, m: sumL(p.lines, made), a: sumL(p.lines, att) })).filter((x) => x.a >= minAtt);
  const own = qualified(roster).sort((x, y) => y.m / y.a - x.m / x.a || y.a - x.a);
  const pool = qualified(everyone).map((x) => (x.m / x.a) * 100);
  const leagueMedian = pool.length ? medianOf(pool) : null;
  const pick = leagueMedian == null ? undefined : own.find((x) => (x.m / x.a) * 100 >= leagueMedian);
  return { pick, ownQualified: own.length, leagueMedian };
}

function buildLateGame(focus: TeamProfile, opp: TeamProfile, focusRoster: PlayerSeason[], oppRoster: PlayerSeason[], everyone: PlayerSeason[]): LateGamePlan {
  const closers: CloserRole[] = [];
  const notes: string[] = [];
  const ftC = bestShooter(focusRoster, everyone, (l) => l.freeThrowsMade, (l) => l.freeThrowsAttempted, cfg.closerFtMinAttempts);
  const threeC = bestShooter(focusRoster, everyone, (l) => l.threePointsMade, (l) => l.threePointsAttempted, cfg.closerThreeMinAttempts);
  const fourC = bestShooter(focusRoster, everyone, (l) => l.fourPointsMade, (l) => l.fourPointsAttempted, cfg.closerFourMinAttempts);
  const ft = ftC.pick;
  const three = threeC.pick;
  const four = fourC.pick;
  if (ft) closers.push({ role: "FREE_THROWS", player: ref(ft.p), value: fp((ft.m / ft.a) * 100), sample: `${ft.a} FTA` });
  if (three) closers.push({ role: "THREE_POINT", player: ref(three.p), value: fp((three.m / three.a) * 100), sample: `${three.a} 3PA` });
  if (four) closers.push({ role: "FOUR_POINT", player: ref(four.p), value: fp((four.m / four.a) * 100), sample: `${four.a} 4PA` });
  for (const [c, name] of [[ftC, "free-throw"], [threeC, "three-point"], [fourC, "four-point"]] as const) {
    if (!c.pick && c.ownQualified > 0 && c.leagueMedian != null) {
      notes.push(`No ${name} closer named: nobody with enough attempts is at or above the league median (${fp(c.leagueMedian)}).`);
    }
  }

  const utKnown = (p: TeamProfile) => (p.stats.get("utFor")?.n ?? 0) > 0;
  const ultraTimeDataAvailable = utKnown(focus) || utKnown(opp);

  const oppUt = oppRoster.filter((p) => p.lines.some((l) => l.ultraTimePoints != null));
  const denyBy = (oppUt.length ? oppUt : oppRoster).filter((p) => p.lines.length >= cfg.minPlayerGames);
  const deny = [...denyBy].sort((a, b) =>
    oppUt.length ? sumL(b.lines, (l) => l.ultraTimePoints) - sumL(a.lines, (l) => l.ultraTimePoints) : sumL(b.lines, (l) => l.points) / b.lines.length - sumL(a.lines, (l) => l.points) / a.lines.length,
  )[0];

  const foul = oppRoster
    .filter((p) => p.lines.length >= cfg.minPlayerGames)
    .map((p) => ({ p, m: sumL(p.lines, (l) => l.freeThrowsMade), a: sumL(p.lines, (l) => l.freeThrowsAttempted) }))
    .filter((x) => x.a >= cfg.poorFtMinAttempts)
    .sort((x, y) => x.m / x.a - y.m / y.a)[0];

  if (!ultraTimeDataAvailable) notes.push("No Ultra Time data for these teams yet; closers are picked from season shooting.");
  if (ftC.ownQualified === 0) notes.push(`No player has ${cfg.closerFtMinAttempts}+ free-throw attempts yet, so there is no evidence-backed late-game ball-handler.`);
  if (four) notes.push("In Ultra Time a made four counts eight: only take it from the named shooter on an open look.");

  return {
    ultraTimeDataAvailable,
    ultraTime: ultraTimeDataAvailable
      ? { focusForPerGame: perGame(focus, "utFor"), focusAgainstPerGame: perGame(focus, "utAgainst"), opponentForPerGame: perGame(opp, "utFor"), opponentAgainstPerGame: perGame(opp, "utAgainst") }
      : null,
    closers,
    deny: deny ? ref(deny) : null,
    foulTarget: foul && (foul.m / foul.a) * 100 < cfg.poorFtPct ? { ...ref(foul.p), ftPct: fp((foul.m / foul.a) * 100), sample: `${foul.a} FTA` } : null,
    notes,
  };
}

// ---------- entry point ----------

function headToHead(games: GameCore[], focusId: string, oppId: string): HeadToHeadSummary {
  const results = games
    .filter((g) => (g.home.seasonClubId === focusId && g.away.seasonClubId === oppId) || (g.home.seasonClubId === oppId && g.away.seasonClubId === focusId))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .map((g) => {
      const focusHome = g.home.seasonClubId === focusId;
      return { scheduledAt: g.scheduledAt, focusScore: focusHome ? g.home.score : g.away.score, opponentScore: focusHome ? g.away.score : g.home.score };
    });
  return {
    games: results.length,
    focusWins: results.filter((r) => r.focusScore > r.opponentScore).length,
    focusLosses: results.filter((r) => r.focusScore < r.opponentScore).length,
    results,
  };
}

export const DEFENSE_NOTE =
  "Box scores don't measure on-ball defence. Assignments use steals, blocks, position and height as a starting point; override them with what you see on film.";

export function buildGamePlan(games: GameCore[], focusSeasonClubId: string, opponentSeasonClubId: string, meta: Map<string, PlayerMeta>): GamePlan | null {
  const profiles = buildTeamProfiles(games);
  const focus = profiles.get(focusSeasonClubId);
  const opp = profiles.get(opponentSeasonClubId);
  if (!focus || !opp) return null;
  const seasons = collectPlayerSeasons(games);
  const focusRoster = rosterOf(seasons, focusSeasonClubId);
  const oppRoster = rosterOf(seasons, opponentSeasonClubId);
  const h2h = headToHead(games, focusSeasonClubId, opponentSeasonClubId);
  const base = {
    focus: { seasonClubId: focus.seasonClubId, name: focus.name, games: focus.games },
    opponent: { seasonClubId: opp.seasonClubId, name: opp.name, games: opp.games },
    headToHead: h2h,
    defenseNote: DEFENSE_NOTE,
  };
  const shortest = Math.min(focus.games, opp.games);
  if (shortest < cfg.minOpponentGames) {
    const who = opp.games < cfg.minOpponentGames ? opp : focus;
    return {
      ...base,
      status: "INSUFFICIENT_DATA",
      insufficientReason: `${who.name} have played ${who.games} game${who.games === 1 ? "" : "s"}; a game plan needs ${cfg.minOpponentGames}.`,
      keys: [],
      howTheyBeatUs: [],
      assignments: [],
      lateGame: null,
    };
  }
  return {
    ...base,
    status: "OK",
    insufficientReason: null,
    keys: keysFor(focus, opp, profiles, seasons, true),
    howTheyBeatUs: keysFor(opp, focus, profiles, seasons, false).slice(0, 3),
    assignments: buildAssignments(focusRoster, oppRoster, meta),
    lateGame: buildLateGame(focus, opp, focusRoster, oppRoster, [...seasons.values()]),
  };
}

// ---------- post-game review ----------

export type KeyReview = { key: KeyToTheGame; verdict: "HELD" | "BROKEN" | "NOT_TESTABLE"; actual: string | null; expected: string };

export function buildGamePlanReview(plan: GamePlan, game: GameCore): KeyReview[] {
  const focusId = plan.focus.seasonClubId;
  const focusHome = game.home.seasonClubId === focusId;
  const sideStats = (s: KeyCheck["side"]) => (s === "FOCUS" ? (focusHome ? game.home : game.away) : focusHome ? game.away : game.home);

  return plan.keys.map((key) => {
    const c = key.check;
    const team = sideStats(c.side);
    const pl = c.playerId ? game.players.find((p) => p.playerId === c.playerId && !p.didNotPlay) : undefined;
    let actual: number | null = null;
    switch (c.stat) {
      case "PLAYER_POINTS": actual = pl ? pl.points : null; break;
      case "PLAYER_FOULS": actual = pl ? pl.fouls : null; break;
      case "PLAYER_FTA_SHARE": {
        const teamFta = sideTotal(team, game.players, "freeThrowsAttempted");
        actual = pl && pl.freeThrowsAttempted != null && teamFta ? (pl.freeThrowsAttempted / teamFta) * 100 : null;
        break;
      }
      case "TEAM_TO": actual = team.turnovers; break;
      case "TEAM_OREB": actual = team.offensiveRebounds; break;
      case "TEAM_3P_PCT": {
        const att = sideTotal(team, game.players, "threePointsAttempted");
        actual = att ? ((sideTotal(team, game.players, "threePointsMade") ?? 0) / att) * 100 : null;
        break;
      }
      case "TEAM_3PA": actual = sideTotal(team, game.players, "threePointsAttempted"); break;
      case "TEAM_POINTS": actual = team.score; break;
      case "FIRST_HALF_MARGIN":
      case "SECOND_HALF_MARGIN": {
        const h = halfMargins(game.periods, focusHome);
        const m = h ? (c.stat === "FIRST_HALF_MARGIN" ? h.first : h.second) : null;
        actual = m == null ? null : c.side === "FOCUS" ? m : -m;
        break;
      }
    }
    const expected = `${c.want === "BELOW" ? "below" : "above"} ${f1(c.baseline)}`;
    if (actual == null) return { key, verdict: "NOT_TESTABLE", actual: null, expected };
    const held = c.want === "BELOW" ? actual < c.baseline : actual > c.baseline;
    return { key, verdict: held ? "HELD" : "BROKEN", actual: f1(actual), expected };
  });
}
