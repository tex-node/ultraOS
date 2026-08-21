// Provisional live record/milestone detection (G.18, Parts XVI-XVII). Pure comparison against
// the EXISTING Season Zero Record Book (`buildPlayerSingleGameRecords` in analytics/records.ts)
// - never a second, independently-computed record book. A live performance is compared to the
// official book's current value; nothing is ever written back into it. The official book only
// ever changes through its own existing FINAL-games computation (records.ts), never from this
// module - that is exactly what "provisional" means here (Part XVI, Stage 18: official only
// once GAME=FINAL and STATISTICS=VERIFIED).
import type { RecordEntry } from "./analytics/records";

export type RecordWatchStatus = "TIED" | "NEW_PROVISIONAL" | "APPROACHING" | null;

// A RecordWatch is only ever constructed for a non-null status (watchPlayerRecords only pushes
// when checkRecordWatch returned something) - narrowed here so callers never need a null check
// on an array that structurally can't contain one.
export type RecordWatch = {
  recordKey: string;
  recordTitle: string;
  officialValue: number;
  liveValue: number;
  status: NonNullable<RecordWatchStatus>;
};

const APPROACHING_MARGIN = 3;

// A fixed margin of 3 would make "APPROACHING" fire for essentially every player still at 0 in
// a category whose record itself is only 1 or 2 (e.g. "Most Blocks - Game" = 1) - found by the
// G.18 rehearsal, which surfaced the same record repeatedly for every player with zero blocks.
// Requiring liveValue > 0 means a player must have actually recorded something in the category
// before it's worth flagging as "approaching" - a real signal, not every zero on the roster.
export function checkRecordWatch(liveValue: number, officialValue: number): RecordWatchStatus {
  if (liveValue > officialValue) return "NEW_PROVISIONAL";
  if (liveValue === officialValue) return "TIED";
  if (liveValue > 0 && officialValue - liveValue > 0 && officialValue - liveValue <= APPROACHING_MARGIN) return "APPROACHING";
  return null;
}

// Compares one player's live stat line against every applicable single-game record from the
// existing Record Book, returning only the entries worth surfacing (TIED/NEW_PROVISIONAL/APPROACHING).
export function watchPlayerRecords(
  liveStats: { points: number; rebounds: number; assists: number; steals: number; blocks: number },
  officialRecords: RecordEntry[],
): RecordWatch[] {
  const statByTitle: Record<string, number> = {
    points: liveStats.points, rebounds: liveStats.rebounds, assists: liveStats.assists,
    steals: liveStats.steals, blocks: liveStats.blocks,
  };
  const titleToStatKey: Record<string, keyof typeof statByTitle> = {};
  // records.ts's bestByStat() is called once per stat with a human title (e.g. "Most Points
  // (Single Game)") - map on substring so a title rename doesn't silently break this without
  // a test failure exposing it (see provisional-records.test.ts).
  for (const [key, title] of [["points", "Points"], ["rebounds", "Rebounds"], ["assists", "Assists"], ["steals", "Steals"], ["blocks", "Blocks"]] as const) {
    titleToStatKey[title] = key;
  }

  const watches: RecordWatch[] = [];
  for (const record of officialRecords) {
    if (record.category !== "PLAYER_SINGLE_GAME") continue;
    const matchedStatLabel = Object.keys(titleToStatKey).find((label) => record.title.includes(label));
    if (!matchedStatLabel) continue;
    const statKey = titleToStatKey[matchedStatLabel];
    const liveValue = statByTitle[statKey];
    const officialValue = Number(record.value);
    if (!Number.isFinite(officialValue)) continue;
    const status = checkRecordWatch(liveValue, officialValue);
    if (status) watches.push({ recordKey: record.key, recordTitle: record.title, officialValue, liveValue, status });
  }
  return watches;
}
