import type { GameStoryTag, PerformerCategory } from "./types";

// Display copy for domain enums — kept here (not in a component) so broadcast/social renderers
// use the exact same labels as the website.

export const GAME_STORY_LABEL: Record<GameStoryTag, string> = {
  CLOSE_GAME: "Close Game",
  OVERTIME: "Overtime Thriller",
  COMEBACK: "Comeback",
  WIRE_TO_WIRE: "Wire to Wire",
  DOMINANT: "Dominant Win",
  SECOND_HALF_TAKEOVER: "Second-Half Takeover",
  SHOOTOUT: "Shootout",
  DEFENSIVE_BATTLE: "Defensive Battle",
  BENCH_IMPACT: "Bench Impact",
  PAINT_DOMINANCE: "Paint Dominance",
  TURNOVER_PRESSURE: "Turnover Pressure",
  PERIMETER_EDGE: "Perimeter Edge",
  REBOUNDING_EDGE: "Rebounding Edge",
};

// Order of visual/narrative importance — the hero shows only the first matching tag.
export const GAME_STORY_PRIORITY: GameStoryTag[] = [
  "OVERTIME",
  "COMEBACK",
  "DOMINANT",
  "WIRE_TO_WIRE",
  "CLOSE_GAME",
  "SECOND_HALF_TAKEOVER",
  "SHOOTOUT",
  "DEFENSIVE_BATTLE",
  "PAINT_DOMINANCE",
  "BENCH_IMPACT",
  "REBOUNDING_EDGE",
  "TURNOVER_PRESSURE",
  "PERIMETER_EDGE",
];

export const PERFORMER_LABEL: Record<PerformerCategory, string> = {
  GAME_STAR: "Game Star",
  TOP_SCORER: "Top Scorer",
  TOP_REBOUNDER: "Top Rebounder",
  TOP_PLAYMAKER: "Top Playmaker",
  TOP_DEFENDER: "Top Defender",
  MOST_EFFICIENT: "Most Efficient",
  BENCH_SPARK: "Bench Spark",
};
