// Timed results (streak v12, Prompt 1b).
//
// A flag race is not decided by points, sets or goals: it is decided by who took the least time. The standings engine
// models W/L and points, which would force a race into a league table it does not have - so a timed sport gets a
// leaderboard instead, built from the FINISH_TIME events the timing console records.
//
// Pure functions only: the caller loads events, this orders them. One athlete's best time counts (a heat and a
// final are not added together), ties share a rank, and an athlete who has not finished is not in the table at all
// rather than sitting at the bottom with a zero.

export type TimedFinish = {
  /** Stable identity of the competitor: a player id, entrant id or season-club id. */
  key: string;
  name: string;
  seconds: number;
  /** Which side of the fixture the competitor belongs to, when known. */
  side?: "HOME" | "AWAY" | null;
};

export type TimedLeaderboardRow = {
  rank: number;
  key: string;
  name: string;
  seconds: number;
  /** Seconds behind the leader (0 for the leader). */
  gapSeconds: number;
  side: "HOME" | "AWAY" | null;
  /** How many recorded finishes this competitor has (a heat plus a final, for example). */
  finishes: number;
};

/**
 * Lowest time wins. Competition ranking: ties share a rank and the next competitor takes the rank after them
 * (12.45, 12.45, 13.10 -> 1, 1, 3). Nobody with a non-positive or non-finite time is ranked.
 */
export function computeTimedLeaderboard(finishes: TimedFinish[]): TimedLeaderboardRow[] {
  const best = new Map<string, { name: string; seconds: number; side: "HOME" | "AWAY" | null; finishes: number }>();
  for (const finish of finishes) {
    if (!Number.isFinite(finish.seconds) || finish.seconds <= 0) continue;
    const existing = best.get(finish.key);
    if (!existing) {
      best.set(finish.key, { name: finish.name, seconds: finish.seconds, side: finish.side ?? null, finishes: 1 });
      continue;
    }
    existing.finishes += 1;
    if (finish.seconds < existing.seconds) {
      existing.seconds = finish.seconds;
      if (finish.name) existing.name = finish.name;
      if (finish.side) existing.side = finish.side;
    }
  }

  const ordered = [...best.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name));
  if (ordered.length === 0) return [];

  const leader = ordered[0].seconds;
  const bestBefore = (seconds: number) => ordered.filter((row) => row.seconds < seconds).length;

  return ordered.map((row) => ({
    rank: bestBefore(row.seconds) + 1,
    key: row.key,
    name: row.name,
    seconds: row.seconds,
    gapSeconds: row.seconds - leader,
    side: row.side,
    finishes: row.finishes,
  }));
}

/** Formats seconds as m:ss.cc, the way a race time is read out. The millisecond part is truncated, never rounded up. */
export function formatRaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const truncated = Math.floor(seconds * 100) / 100;
  const minutes = Math.floor(truncated / 60);
  const remainder = truncated - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}
