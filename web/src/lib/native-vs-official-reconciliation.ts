// Native-vs-official/PDF reconciliation (G.17, Part VIII). Pure comparison engine only - never
// writes anything. The existing import guard (`importGameResult` in game-result-import.ts,
// "Fixture is already FINAL... Use the supersede workflow instead") already prevents a PDF
// import from silently overwriting a natively-scored FINAL game's PlayerStat/TeamStat; what was
// actually missing was a way to compare the two sources side by side once both exist for the
// same game, which is what this module provides.
//
// Both sources remain fully separable by construction: native stats carry
// `statSource: EVENT_DERIVED`/`ULTRA_NATIVE_LIVE_SCORER`, official imports carry
// `statSource: FIBA_LIVESTATS_PDF_IMPORT` (or another import-category value) - this module never
// merges them into a single row, it only reports where they agree and disagree.

export type ComparableStatField =
  | "points" | "fieldGoalsMade" | "fieldGoalsAttempted"
  | "threePointsMade" | "threePointsAttempted"
  | "freeThrowsMade" | "freeThrowsAttempted"
  | "rebounds" | "offensiveRebounds" | "defensiveRebounds"
  | "assists" | "steals" | "blocks" | "turnovers" | "fouls"
  | "fourPointsMade" | "fourPointsAttempted";

// A source's value for one field: a real captured number, or null meaning "this source does not
// provide this field at all" - never 0 standing in for "not provided" (the same NULL =
// NOT_CAPTURED convention used everywhere else in this codebase's stat model).
export type StatSourceLine = Partial<Record<ComparableStatField, number | null>>;

export type FieldComparisonState = "MATCH" | "MISMATCH" | "NATIVE_ONLY" | "OFFICIAL_ONLY" | "NOT_COMPARABLE";

export type FieldComparison = {
  field: ComparableStatField;
  nativeValue: number | null;
  officialValue: number | null;
  state: FieldComparisonState;
};

const ALL_FIELDS: ComparableStatField[] = [
  "points", "fieldGoalsMade", "fieldGoalsAttempted",
  "threePointsMade", "threePointsAttempted",
  "freeThrowsMade", "freeThrowsAttempted",
  "rebounds", "offensiveRebounds", "defensiveRebounds",
  "assists", "steals", "blocks", "turnovers", "fouls",
  "fourPointsMade", "fourPointsAttempted",
];

export function compareField(field: ComparableStatField, native: StatSourceLine, official: StatSourceLine): FieldComparison {
  const nativeValue = native[field] ?? null;
  const officialValue = official[field] ?? null;
  let state: FieldComparisonState;
  if (nativeValue === null && officialValue === null) state = "NOT_COMPARABLE";
  else if (nativeValue !== null && officialValue === null) state = "NATIVE_ONLY";
  else if (nativeValue === null && officialValue !== null) state = "OFFICIAL_ONLY";
  else state = nativeValue === officialValue ? "MATCH" : "MISMATCH";
  return { field, nativeValue, officialValue, state };
}

export type LineReconciliationState = "FULL_MATCH" | "PARTIAL_MATCH" | "MISMATCH" | "INSUFFICIENT_DATA";

export type LineReconciliation = {
  fields: FieldComparison[];
  state: LineReconciliationState;
};

// Compares every known field between one native line and one official line (a player's or a
// team's - the field set is the same shape for both). Game-level rollup: any real MISMATCH
// dominates; otherwise any NATIVE_ONLY/OFFICIAL_ONLY presence makes it a PARTIAL_MATCH; if every
// field was directly comparable and agreed, FULL_MATCH; if nothing was comparable at all (e.g.
// this player only exists in one source), INSUFFICIENT_DATA.
export function reconcileLine(native: StatSourceLine, official: StatSourceLine, fields: ComparableStatField[] = ALL_FIELDS): LineReconciliation {
  const comparisons = fields.map((field) => compareField(field, native, official));
  const hasMismatch = comparisons.some((c) => c.state === "MISMATCH");
  const hasMatch = comparisons.some((c) => c.state === "MATCH");
  const hasSourceOnly = comparisons.some((c) => c.state === "NATIVE_ONLY" || c.state === "OFFICIAL_ONLY");

  let state: LineReconciliationState;
  if (hasMismatch) state = "MISMATCH";
  else if (hasSourceOnly) state = "PARTIAL_MATCH";
  else if (hasMatch) state = "FULL_MATCH";
  else state = "INSUFFICIENT_DATA";

  return { fields: comparisons, state };
}

export type PlayerReconciliation = LineReconciliation & { playerId: string };
export type TeamReconciliation = LineReconciliation & { seasonClubId: string };

export function reconcilePlayers(
  nativeByPlayer: Map<string, StatSourceLine>,
  officialByPlayer: Map<string, StatSourceLine>,
): PlayerReconciliation[] {
  const playerIds = new Set([...nativeByPlayer.keys(), ...officialByPlayer.keys()]);
  return [...playerIds].map((playerId) => ({
    playerId,
    ...reconcileLine(nativeByPlayer.get(playerId) ?? {}, officialByPlayer.get(playerId) ?? {}),
  }));
}

export type GameReconciliationSummary = {
  players: PlayerReconciliation[];
  teams: TeamReconciliation[];
  overallState: LineReconciliationState;
};

const STATE_SEVERITY: Record<LineReconciliationState, number> = { MISMATCH: 3, PARTIAL_MATCH: 2, INSUFFICIENT_DATA: 1, FULL_MATCH: 0 };

export function summarizeGameReconciliation(players: PlayerReconciliation[], teams: TeamReconciliation[]): GameReconciliationSummary {
  const worst = [...players, ...teams].reduce<LineReconciliationState>((worstState, r) => (
    STATE_SEVERITY[r.state] > STATE_SEVERITY[worstState] ? r.state : worstState
  ), "FULL_MATCH");
  return { players, teams, overallState: worst };
}
