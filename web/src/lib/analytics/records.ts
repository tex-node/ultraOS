import { isShootingQualified } from "./qualification";
import { formatPercent, percent, round1 } from "./normalization";
import type { GameCore, PlayerLine } from "./types";

// The Season Zero Record Book — every entry is a direct min/max/qualified-best reduction over
// real GameCore/PlayerLine data, with a documented, deterministic tie-break (chronologically
// earliest game wins a tie, so the book never silently reorders itself as more games are added
// under an identical tied value). Nothing here is estimated or reconstructed from other fields.

export type RecordEntry = {
  key: string;
  category: "PLAYER_SINGLE_GAME" | "PLAYER_SEASON" | "TEAM" | "GAME";
  title: string;
  value: string;
  holderName: string;
  holderClubShortName: string;
  context: string;
  fixtureId: string | null;
};

function tieBreakEarliest<T extends { scheduledAt: Date }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

type GamePlayerRow = PlayerLine & { fixtureId: string; scheduledAt: Date; opponentShortName: string };

function allPlayerGameRows(games: GameCore[]): GamePlayerRow[] {
  const rows: GamePlayerRow[] = [];
  for (const g of games) {
    for (const p of g.players) {
      if (p.didNotPlay) continue;
      const opponentShortName = p.side === "HOME" ? g.away.shortName : g.home.shortName;
      rows.push({ ...p, fixtureId: g.fixtureId, scheduledAt: g.scheduledAt, opponentShortName });
    }
  }
  return rows;
}

function bestByStat(rows: GamePlayerRow[], statKey: keyof Pick<PlayerLine, "points" | "rebounds" | "assists" | "steals" | "blocks">, title: string): RecordEntry | null {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r[statKey]));
  const holders = tieBreakEarliest(rows.filter((r) => r[statKey] === max));
  const best = holders[0];
  return {
    key: title,
    category: "PLAYER_SINGLE_GAME",
    title,
    value: String(max),
    holderName: best.name,
    holderClubShortName: best.seasonClubShortName,
    context: `vs ${best.opponentShortName}`,
    fixtureId: best.fixtureId,
  };
}

export function buildPlayerSingleGameRecords(games: GameCore[]): RecordEntry[] {
  const rows = allPlayerGameRows(games);
  const entries: (RecordEntry | null)[] = [
    bestByStat(rows, "points", "Most Points — Game"),
    bestByStat(rows, "rebounds", "Most Rebounds — Game"),
    bestByStat(rows, "assists", "Most Assists — Game"),
    bestByStat(rows, "steals", "Most Steals — Game"),
    bestByStat(rows, "blocks", "Most Blocks — Game"),
  ];

  const qualifiedShooting = rows
    .filter((r) => isShootingQualified(r.fieldGoalsAttempted))
    .map((r) => ({ row: r, pct: percent(r.fieldGoalsMade, r.fieldGoalsAttempted) as number }));
  if (qualifiedShooting.length > 0) {
    const maxPct = Math.max(...qualifiedShooting.map((x) => x.pct));
    const best = tieBreakEarliest(qualifiedShooting.filter((x) => x.pct === maxPct).map((x) => x.row))[0];
    entries.push({
      key: "Best Qualified FG% — Game",
      category: "PLAYER_SINGLE_GAME",
      title: "Best Qualified FG% — Game",
      value: formatPercent(maxPct),
      holderName: best.name,
      holderClubShortName: best.seasonClubShortName,
      context: `${best.fieldGoalsMade}/${best.fieldGoalsAttempted} vs ${best.opponentShortName}`,
      fixtureId: best.fixtureId,
    });
  }

  return entries.filter((e): e is RecordEntry => e != null);
}

export type SeasonPlayerRecordInput = {
  playerId: string;
  name: string;
  seasonClubShortName: string;
  gamesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
};

function bestByTotal(players: SeasonPlayerRecordInput[], key: "points" | "rebounds" | "assists" | "steals" | "blocks", title: string): RecordEntry | null {
  if (players.length === 0) return null;
  const max = Math.max(...players.map((p) => p[key]));
  const holder = players.find((p) => p[key] === max);
  if (!holder || max === 0) return null;
  return { key: title, category: "PLAYER_SEASON", title, value: String(max), holderName: holder.name, holderClubShortName: holder.seasonClubShortName, context: `${holder.gamesPlayed} games`, fixtureId: null };
}

function bestByQualifiedRate(players: SeasonPlayerRecordInput[], title: string, minGames: number, getRate: (p: SeasonPlayerRecordInput) => number): RecordEntry | null {
  const qualified = players.filter((p) => p.gamesPlayed >= minGames);
  if (qualified.length === 0) return null;
  const withRate = qualified.map((p) => ({ p, rate: getRate(p) }));
  const max = Math.max(...withRate.map((x) => x.rate));
  const holder = withRate.find((x) => x.rate === max);
  if (!holder) return null;
  return { key: title, category: "PLAYER_SEASON", title, value: round1(max).toFixed(1), holderName: holder.p.name, holderClubShortName: holder.p.seasonClubShortName, context: `${holder.p.gamesPlayed} games`, fixtureId: null };
}

function bestByQualifiedPct(players: SeasonPlayerRecordInput[], title: string, made: (p: SeasonPlayerRecordInput) => number, attempted: (p: SeasonPlayerRecordInput) => number): RecordEntry | null {
  const qualified = players.filter((p) => isShootingQualified(attempted(p)));
  if (qualified.length === 0) return null;
  const withPct = qualified.map((p) => ({ p, pct: percent(made(p), attempted(p)) as number }));
  const max = Math.max(...withPct.map((x) => x.pct));
  const holder = withPct.find((x) => x.pct === max);
  if (!holder) return null;
  return { key: title, category: "PLAYER_SEASON", title, value: formatPercent(max), holderName: holder.p.name, holderClubShortName: holder.p.seasonClubShortName, context: `${made(holder.p)}/${attempted(holder.p)}`, fixtureId: null };
}

export function buildPlayerSeasonRecords(players: SeasonPlayerRecordInput[], minGamesForRate = 2): RecordEntry[] {
  const entries: (RecordEntry | null)[] = [
    bestByTotal(players, "points", "Most Total Points"),
    bestByTotal(players, "rebounds", "Most Total Rebounds"),
    bestByTotal(players, "assists", "Most Total Assists"),
    bestByTotal(players, "steals", "Most Total Steals"),
    bestByTotal(players, "blocks", "Most Total Blocks"),
    bestByQualifiedRate(players, "Highest Qualified PPG", minGamesForRate, (p) => p.points / p.gamesPlayed),
    bestByQualifiedRate(players, "Highest Qualified RPG", minGamesForRate, (p) => p.rebounds / p.gamesPlayed),
    bestByQualifiedPct(players, "Best Qualified FG%", (p) => p.fieldGoalsMade, (p) => p.fieldGoalsAttempted),
    bestByQualifiedPct(players, "Best Qualified 3PT%", (p) => p.threePointsMade, (p) => p.threePointsAttempted),
    bestByQualifiedPct(players, "Best Qualified FT%", (p) => p.freeThrowsMade, (p) => p.freeThrowsAttempted),
  ];
  return entries.filter((e): e is RecordEntry => e != null);
}

export function buildTeamRecords(games: GameCore[]): RecordEntry[] {
  const entries: RecordEntry[] = [];
  const sides = games.flatMap((g) => [
    { side: g.home, opp: g.away, game: g },
    { side: g.away, opp: g.home, game: g },
  ]);
  if (sides.length === 0) return entries;

  function pushBest(title: string, get: (s: (typeof sides)[number]) => number | null, fmt: (v: number) => string = String) {
    const withValue = sides.filter((s) => get(s) != null);
    if (withValue.length === 0) return;
    const values = withValue.map((s) => get(s) as number);
    const max = Math.max(...values);
    const holder = tieBreakEarliest(withValue.filter((s) => get(s) === max).map((s) => ({ ...s, scheduledAt: s.game.scheduledAt })))[0];
    if (!holder) return;
    entries.push({
      key: title, category: "TEAM", title, value: fmt(max),
      holderName: holder.side.name, holderClubShortName: holder.side.shortName,
      context: `vs ${holder.opp.shortName}`, fixtureId: holder.game.fixtureId,
    });
  }

  pushBest("Highest Team Score — Game", (s) => s.side.score);
  pushBest("Lowest Points Allowed — Game", (s) => -s.opp.score, (v) => String(-v)); // maximize -oppScore = minimize oppScore
  pushBest("Biggest Win — Game", (s) => s.side.score - s.opp.score > 0 ? s.side.score - s.opp.score : null);
  pushBest("Most Team Rebounds — Game", (s) => s.side.offensiveRebounds != null && s.side.defensiveRebounds != null ? s.side.offensiveRebounds + s.side.defensiveRebounds : null);
  pushBest("Most Team Assists — Game", (s) => s.side.assists);
  pushBest("Most Bench Points — Game", (s) => s.side.benchPoints);
  pushBest("Most Paint Points — Game", (s) => s.side.pointsInPaint);

  return entries;
}

export function buildGameRecords(games: GameCore[]): RecordEntry[] {
  if (games.length === 0) return [];
  const entries: RecordEntry[] = [];

  function context(g: GameCore) { return `${g.home.shortName} ${g.home.score} – ${g.away.score} ${g.away.shortName}`; }

  const byCombined = tieBreakEarliest([...games].sort((a, b) => (b.home.score + b.away.score) - (a.home.score + a.away.score)));
  const highest = byCombined[0];
  entries.push({ key: "Highest-Scoring Game", category: "GAME", title: "Highest-Scoring Game", value: `${highest.home.score + highest.away.score} pts`, holderName: context(highest), holderClubShortName: "", context: "combined score", fixtureId: highest.fixtureId });

  const lowest = [...games].sort((a, b) => (a.home.score + a.away.score) - (b.home.score + b.away.score))[0];
  entries.push({ key: "Lowest-Scoring Game", category: "GAME", title: "Lowest-Scoring Game", value: `${lowest.home.score + lowest.away.score} pts`, holderName: context(lowest), holderClubShortName: "", context: "combined score", fixtureId: lowest.fixtureId });

  const decided = games.filter((g) => g.home.score !== g.away.score);
  if (decided.length > 0) {
    const closest = [...decided].sort((a, b) => Math.abs(a.home.score - a.away.score) - Math.abs(b.home.score - b.away.score))[0];
    entries.push({ key: "Closest Game", category: "GAME", title: "Closest Game", value: `${Math.abs(closest.home.score - closest.away.score)} pt margin`, holderName: context(closest), holderClubShortName: "", context: "final margin", fixtureId: closest.fixtureId });

    const biggest = [...decided].sort((a, b) => Math.abs(b.home.score - b.away.score) - Math.abs(a.home.score - a.away.score))[0];
    entries.push({ key: "Biggest Margin", category: "GAME", title: "Biggest Margin", value: `${Math.abs(biggest.home.score - biggest.away.score)} pts`, holderName: context(biggest), holderClubShortName: "", context: "final margin", fixtureId: biggest.fixtureId });
  }

  const otGames = games.filter((g) => g.periods.some((p) => /^OT/i.test(p.label)));
  if (otGames.length > 0) {
    const first = tieBreakEarliest(otGames)[0];
    entries.push({ key: "Overtime Games", category: "GAME", title: "Overtime Games", value: String(otGames.length), holderName: context(first), holderClubShortName: "", context: "first of the season", fixtureId: first.fixtureId });
  }

  // Biggest comeback: the largest deficit the eventual winner overcame at any earlier period
  // checkpoint, using the same period-cumulative method already validated in game-story.ts's
  // COMEBACK tag — never reconstructed from anything finer than the real imported period scores.
  let biggestComeback: { deficit: number; game: GameCore } | null = null;
  for (const g of games) {
    const reg = g.periods.filter((p) => !/^OT/i.test(p.label));
    if (reg.length < 2) continue;
    const winner = g.home.score >= g.away.score ? "home" : "away";
    const deficit = Math.max(0, ...reg.slice(0, -1).map((p) => {
      const winnerCum = winner === "home" ? p.homeScore : p.awayScore;
      const loserCum = winner === "home" ? p.awayScore : p.homeScore;
      return loserCum - winnerCum;
    }));
    if (deficit > 0 && (biggestComeback == null || deficit > biggestComeback.deficit)) biggestComeback = { deficit, game: g };
  }
  if (biggestComeback) {
    entries.push({ key: "Biggest Comeback", category: "GAME", title: "Biggest Comeback", value: `${biggestComeback.deficit} pts`, holderName: context(biggestComeback.game), holderClubShortName: "", context: "deficit overcome", fixtureId: biggestComeback.game.fixtureId });
  }

  return entries;
}
