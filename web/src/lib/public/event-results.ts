// Shape of `Event.results`: the editorial final standings for a completed event (one podium
// per category). Kept in one place so every surface that shows them - the public event page
// and the tournament sub-site - agrees on what a valid payload looks like.
export type EventResultPlacement = { rank?: number; name: string };

export type EventResultCategory = {
  key?: string;
  label: string;
  kind?: string;
  sport?: string;
  placements: EventResultPlacement[];
};

export type EventResults = { publishedAt?: string; categories: EventResultCategory[] };

export function parseEventResults(raw: unknown): EventResults | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as EventResults;
  if (!Array.isArray(value.categories) || value.categories.length === 0) return null;
  return value;
}
