// Shape of `Event.results`: the editorial final standings for a completed event (one podium per
// category). Kept in one place so every surface that shows them - the public event page, the
// tournament sub-site and the event's short link - agrees on what a valid payload looks like.
//
// v33: a placement may now carry the few facts a reader actually wants next to a medal - the club or
// team a runner represented (`detail`), the bib they wore (`bib`), a recorded time (`time`) and a
// one-line note. All optional, so every payload published before this change still parses and still
// renders; none of them is inferred when absent (an invented time is worse than no time).
export type EventResultPlacement = {
  rank?: number;
  name: string;
  /** Club, team or institution - shown beside the name, e.g. "IVC" or "Lagos State". */
  detail?: string;
  /** Bib / entry number worn at the venue. */
  bib?: string;
  /** A recorded race time, as published (e.g. "0:12.84"). Never estimated. */
  time?: string;
  /** Why a placement is unusual - a tie, a disqualification, a shared rank. */
  note?: string;
};

export type ResultGender = "MALE" | "FEMALE" | "MIXED";

export type EventResultCategory = {
  key?: string;
  label: string;
  /** TEAM for a standings table, INDIVIDUAL for a race or a bracket of people. */
  kind?: string;
  sport?: string;
  gender?: ResultGender;
  /** Applies to the whole category - e.g. "wind-assisted" or "two entrants only". */
  note?: string;
  placements: EventResultPlacement[];
};

export type EventResults = { publishedAt?: string; categories: EventResultCategory[] };

export function parseEventResults(raw: unknown): EventResults | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as EventResults;
  if (!Array.isArray(value.categories) || value.categories.length === 0) return null;
  return value;
}

export type ResultPlacementView = {
  rank: number;
  medal: "gold" | "silver" | "bronze" | null;
  name: string;
  detail: string | null;
  bib: string | null;
  time: string | null;
  note: string | null;
};

export type ResultCategoryView = {
  key: string;
  label: string;
  gender: ResultGender;
  isTeam: boolean;
  sport: string | null;
  note: string | null;
  placements: ResultPlacementView[];
};

export type ResultsBoard = {
  publishedAt: string | null;
  team: ResultCategoryView[];
  individual: ResultCategoryView[];
  /** True when at least one category exists - the board renders nothing otherwise. */
  hasResults: boolean;
};

const MEDALS = ["gold", "silver", "bronze"] as const;

function medalFor(rank: number): ResultPlacementView["medal"] {
  return rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : null;
}

// A category's gender decides the heading it lands under ("Men" / "Women"), and is inferred from the
// key or label when the payload predates the field - GIESM's original payload used keys like
// "MALE_FLAG_RACE", and every older event used "Male category". Inference is limited to those words
// appearing, so anything ambiguous stays MIXED rather than being guessed into a wrong section.
function normaliseGender(category: EventResultCategory): ResultGender {
  if (category.gender) return category.gender;
  const haystack = `${category.key ?? ""} ${category.label}`.toUpperCase();
  const male = /\bMALE\b|\bMEN\b/.test(haystack);
  const female = /\bFEMALE\b|\bWOMEN\b/.test(haystack);
  if (male && !female) return "MALE";
  if (female && !male) return "FEMALE";
  return "MIXED";
}

function isTeamCategory(category: EventResultCategory): boolean {
  if (category.kind) return category.kind.toUpperCase() === "TEAM";
  return (category.sport ?? "").toUpperCase() !== "FLAG_RACE";
}

function toPlacementView(placement: EventResultPlacement, index: number): ResultPlacementView {
  // Ranks are published, but a payload without one still renders in list order - a missing rank must
  // not renumber the podium, so the fallback is positional and only used when nothing is published.
  const rank = typeof placement.rank === "number" && Number.isFinite(placement.rank) ? placement.rank : index + 1;
  const text = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);
  return {
    rank,
    medal: medalFor(rank),
    name: placement.name,
    detail: text(placement.detail),
    bib: text(placement.bib),
    time: text(placement.time),
    note: text(placement.note),
  };
}

function toCategoryView(category: EventResultCategory): ResultCategoryView {
  const placements = (category.placements ?? [])
    .map(toPlacementView)
    .sort((left, right) => left.rank - right.rank);
  return {
    key: category.key ?? category.label,
    label: category.label,
    gender: normaliseGender(category),
    isTeam: isTeamCategory(category),
    sport: category.sport ?? null,
    note: category.note ?? null,
    placements,
  };
}

/**
 * Turns a published payload into the two groups every surface renders: team standings and individual
 * events, each with medals, ordered placements and the optional facts. Pure, so the public event page,
 * the tournament sub-site and the short link cannot disagree about what the same payload means.
 */
export function buildResultsBoard(results: EventResults): ResultsBoard {
  const categories = results.categories.map(toCategoryView);
  return {
    publishedAt: results.publishedAt ?? null,
    team: categories.filter((category) => category.isTeam),
    individual: categories.filter((category) => !category.isTeam),
    hasResults: categories.some((category) => category.placements.length > 0),
  };
}
