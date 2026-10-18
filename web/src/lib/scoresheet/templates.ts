// Sheet layouts as DATA (P15 I1). A layout says which stat each column carries and the header words
// that identify it; it deliberately does NOT hard-code pixel/fraction positions, because phone
// photos of the same template differ in crop, rotation and scale. The extractor finds the header
// row, uses its word positions as column anchors, and maps each data row's cells to the nearest
// anchor - so one layout definition works across scans of the same sheet design.
//
// A new league format is a new entry here (and a row in ScoresheetTemplate), not a code path. v1 is
// basketball: the LBCL sheet and the FIBA-style box score are the two known designs.

export type ScoresheetColumnKey =
  | "jersey"
  | "name"
  | "minutes"
  | "points"
  | "fgm"
  | "fga"
  | "fg2m"
  | "fg2a"
  | "fg3m"
  | "fg3a"
  | "fg4m"
  | "fg4a"
  | "ftm"
  | "fta"
  | "oreb"
  | "dreb"
  | "reb"
  | "assists"
  | "turnovers"
  | "steals"
  | "blocks"
  | "fouls"
  | "foulsDrawn"
  | "plusMinus"
  | "efficiency";

export type ScoresheetColumn = {
  key: ScoresheetColumnKey;
  /** Header words/abbreviations this column may be printed as. Matched case-insensitively. */
  headers: string[];
  /**
   * Some sheets print a made-attempted pair in one column ("6-14"). When true, the extractor splits
   * on the dash into `key` (made) and the paired attempts column named by `pairKey`.
   */
  pairKey?: ScoresheetColumnKey;
  pairSeparator?: string;
};

export type ScoresheetColumnGroup = {
  key: string;
  /** Header words for the group, as printed ("Field Goals", "Free Throws"). */
  labels: string[];
  /** Sub-columns under this group, in printing order; null = a slice deliberately ignored (the % columns). */
  columns: (ScoresheetColumnKey | null)[];
};

export type ScoresheetLayout = {
  key: string;
  name: string;
  sportSlug: string;
  columns: ScoresheetColumn[];
  /**
   * Grouped header definition (FIBA/Genius sheets): a group label printed above several sub-columns.
   * The group label anchors a block of the row; the block is split into `columns.length` slices, so
   * the ignored "%" sub-columns still occupy a slice and keep everything else aligned.
   */
  groups?: ScoresheetColumnGroup[];
  /** Row labels that mean "this is the team totals row", not a player. */
  totalsLabels: string[];
  /** Markers in the minutes cell (or anywhere in the row) that mean the player did not play. */
  dnpMarkers: string[];
  notes: string[];
};

const BASKETBALL_BASE: ScoresheetColumn[] = [
  { key: "jersey", headers: ["#", "no", "no.", "number", "num"] },
  { key: "name", headers: ["player", "name", "players name"] },
  { key: "minutes", headers: ["min", "mins", "minutes", "mp"] },
  { key: "points", headers: ["pts", "points", "p"] },
  { key: "fgm", headers: ["fgm", "fg"], pairKey: "fga", pairSeparator: "-" },
  { key: "fga", headers: ["fga"] },
  { key: "fg2m", headers: ["2pm", "2fgm", "2ptm", "2p m"], pairKey: "fg2a", pairSeparator: "-" },
  { key: "fg2a", headers: ["2pa", "2fga", "2pta"] },
  { key: "fg3m", headers: ["3pm", "3fgm", "3ptm"], pairKey: "fg3a", pairSeparator: "-" },
  { key: "fg3a", headers: ["3pa", "3fga", "3pta"] },
  { key: "ftm", headers: ["ftm", "ft"], pairKey: "fta", pairSeparator: "-" },
  { key: "fta", headers: ["fta"] },
  { key: "oreb", headers: ["or", "oreb", "off", "off reb", "or."] },
  { key: "dreb", headers: ["dr", "dreb", "def", "def reb", "dr."] },
  { key: "reb", headers: ["reb", "tot", "tot reb", "rebounds"] },
  { key: "assists", headers: ["ast", "assists", "a"] },
  { key: "turnovers", headers: ["to", "to.", "tov", "turnovers"] },
  { key: "steals", headers: ["stl", "steals", "s"] },
  { key: "blocks", headers: ["blk", "blocks", "b"] },
  { key: "fouls", headers: ["pf", "fouls", "f", "fouls committed"] },
  { key: "foulsDrawn", headers: ["fd", "fouls drawn"] },
  { key: "plusMinus", headers: ["+/-", "+-", "plus minus"] },
  { key: "efficiency", headers: ["eff", "efficiency", "per", "pir"] },
];

export const LBCL_LAYOUT: ScoresheetLayout = {
  key: "lbcl",
  name: "LBCL box score (printed, 16 stat columns)",
  sportSlug: "basketball",
  columns: BASKETBALL_BASE,
  totalsLabels: ["totals", "total", "team", "team totals", "totals:"],
  dnpMarkers: ["dnp", "dnd", "did not play", "-", ""],
  notes: [
    "The LBCL sheets this project has transcribed print one row per player and a Totals row per team.",
    "Minutes are printed whole (37:59 -> 37) - the extractor preserves what is printed and never rounds.",
  ],
};

export const FIBA_LAYOUT: ScoresheetLayout = {
  key: "fiba",
  name: "FIBA box score",
  sportSlug: "basketball",
  columns: BASKETBALL_BASE,
  // The printed layout of the sheets LBCL publishes (Genius Sports FIBA export, photographed):
  // No | Name | Min | FG M A % | 2P M A % | 3P M A % | FT M A % | OR DR TOT | AS TO ST BS | PF FD | +/- | EF | PTS.
  // Only the groups the extractor can map are declared; the numbers after "Fouls" (+/-, EF, PTS)
  // are reached by the flat `columns` aliases instead, and the repeated M/% sub-labels are the
  // reason the sub-columns are positional slices rather than anchor-matched.
  groups: [
    { key: "fg", labels: ["field goals", "fg"], columns: ["fgm", "fga", null] },
    { key: "2p", labels: ["2 points", "2pts", "2pt"], columns: ["fg2m", "fg2a", null] },
    { key: "3p", labels: ["3 points", "3pts", "3pt"], columns: ["fg3m", "fg3a", null] },
    { key: "ft", labels: ["free throws", "freethrows", "ft"], columns: ["ftm", "fta", null] },
    { key: "reb", labels: ["rebounds", "reb"], columns: ["oreb", "dreb", "reb"] },
    { key: "fouls", labels: ["fouls", "pf"], columns: ["fouls", "foulsDrawn"] },
  ],
  totalsLabels: ["totals", "team totals", "team"],
  dnpMarkers: ["dnp", "dnd", "did not play", "inactive"],
  notes: [
    "FIBA sheets often print made-attempted pairs (6-14) in one column; pairKey handles that.",
    "The LBCL sheets also print a group header row above the M/A/% sub-columns - that grouped row is what anchors a block of the table.",
  ],
};

export const BUILT_IN_LAYOUTS: Record<string, ScoresheetLayout> = { lbcl: LBCL_LAYOUT, fiba: FIBA_LAYOUT };

export function getLayout(key: string): ScoresheetLayout | null {
  return BUILT_IN_LAYOUTS[key] ?? null;
}

// A stored ScoresheetTemplate.layout is validated against this so a hand-edited row cannot crash
// extraction with a shape the code does not understand.
export function parseLayout(value: unknown): ScoresheetLayout | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ScoresheetLayout>;
  if (typeof v.key !== "string" || !Array.isArray(v.columns) || v.columns.length === 0) return null;
  const columns = v.columns.filter((c): c is ScoresheetColumn => Boolean(c && typeof c === "object" && typeof (c as ScoresheetColumn).key === "string" && Array.isArray((c as ScoresheetColumn).headers)));
  if (columns.length === 0) return null;
  return {
    key: v.key,
    name: String(v.name ?? v.key),
    sportSlug: String(v.sportSlug ?? "basketball"),
    columns,
    totalsLabels: Array.isArray(v.totalsLabels) ? v.totalsLabels.map(String) : ["totals", "total", "team"],
    dnpMarkers: Array.isArray(v.dnpMarkers) ? v.dnpMarkers.map(String) : ["dnp", "-", ""],
    notes: Array.isArray(v.notes) ? v.notes.map(String) : [],
  };
}
