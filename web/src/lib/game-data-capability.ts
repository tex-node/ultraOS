// Single source of truth for what a game's persisted GameDataCapability level actually
// guarantees about the trustworthiness of its stat fields. Callers (API routes, the live
// scorer UI, broadcast payloads) should ask this instead of re-deriving the same reasoning
// ad hoc, and never infer capability from whether a field happens to be non-null - a
// BOX_SCORE_ONLY game and an ULTRA_NATIVE_EVENTS game can both have a populated `points`
// column, but only the native one can be trusted for 4PT/Ultra Time breakdowns.
export type GameDataCapability =
  | "BOX_SCORE_ONLY"
  | "PLAY_BY_PLAY"
  | "ULTRA_NATIVE_EVENTS"
  | "SHOT_LOCATION"
  | "VISION_ENRICHED";

// Ordered weakest -> richest. Each level is a strict superset of what the previous one
// guarantees - never assume a later level's data exists without checking, but a later level
// always implies everything an earlier one implies.
export const GAME_DATA_CAPABILITY_LEVELS: GameDataCapability[] = [
  "BOX_SCORE_ONLY",
  "PLAY_BY_PLAY",
  "ULTRA_NATIVE_EVENTS",
  "SHOT_LOCATION",
  "VISION_ENRICHED",
];

function atLeast(capability: GameDataCapability, floor: GameDataCapability): boolean {
  return GAME_DATA_CAPABILITY_LEVELS.indexOf(capability) >= GAME_DATA_CAPABILITY_LEVELS.indexOf(floor);
}

// True once individual scoring events (not just final aggregate totals) exist for the game -
// e.g. an event feed / play-by-play can be rendered.
export function hasEventLedger(capability: GameDataCapability): boolean {
  return atLeast(capability, "PLAY_BY_PLAY");
}

// True only when 4PT/Ultra Time breakdowns were actually derived from real events (this
// app's native scorer), not just present as columns that happen to be null. A FIBA/Genius
// Sports box-score import never reaches this level, since standard box scores have no
// visibility into Ultra's custom rules at all.
export function hasUltraStatDerivation(capability: GameDataCapability): boolean {
  return atLeast(capability, "ULTRA_NATIVE_EVENTS");
}

export function hasShotLocation(capability: GameDataCapability): boolean {
  return atLeast(capability, "SHOT_LOCATION");
}

export function hasVisionEnrichment(capability: GameDataCapability): boolean {
  return capability === "VISION_ENRICHED";
}

export const GAME_DATA_CAPABILITY_LABEL: Record<GameDataCapability, string> = {
  BOX_SCORE_ONLY: "Box score only",
  PLAY_BY_PLAY: "Play-by-play",
  ULTRA_NATIVE_EVENTS: "Ultra native events",
  SHOT_LOCATION: "Shot location",
  VISION_ENRICHED: "Vision enriched",
};

// Simplified 3-tier view of the 5-level GameDataCapability, for callers (analytics domain
// layer, UI) that only need to answer "box score, event-level, or full Ultra" rather than
// reason about the full granularity. Centralized here so no component re-derives this mapping.
export type GameAnalyticsCapability = "BOX_SCORE_ONLY" | "EVENT_LEVEL" | "FULL_ULTRA";

export function getGameAnalyticsCapability(capability: GameDataCapability): GameAnalyticsCapability {
  if (capability === "BOX_SCORE_ONLY") return "BOX_SCORE_ONLY";
  if (hasUltraStatDerivation(capability)) return "FULL_ULTRA";
  return "EVENT_LEVEL";
}

// One compact, public-safe provenance label per tier — never the underlying filename (that's
// for admin/debug surfaces only). Intended to be the single capability indicator on a game
// page, not one of several redundant warnings.
export const GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL: Record<GameAnalyticsCapability, string> = {
  BOX_SCORE_ONLY: "Official box score data",
  EVENT_LEVEL: "Live event data",
  FULL_ULTRA: "Full Ultra game data",
};
