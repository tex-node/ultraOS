import type { PlayerArchetype } from "./player-archetype";
import { computePlayerArchetype } from "./player-archetype";
import type { PlayerDna, PlayerDnaDimensionKey } from "./player-dna";
import { PLAYER_DNA_DIMENSION_LABEL } from "./player-dna";

// Deterministic plain-English identity sentence, built directly from the same archetype
// computation already shown elsewhere on the player page — never a second, independent set of
// rules that could drift out of sync with the archetype badge. No runtime LLM call.

const ARCHETYPE_SENTENCE: Record<PlayerArchetype, string> = {
  PRIMARY_SCORER: "High-volume scorer",
  REBOUNDING_FORCE: "Rebounding-focused contributor",
  PLAYMAKING_GUARD: "Playmaking-oriented guard",
  DEFENSIVE_DISRUPTOR: "Defense-first contributor",
  EFFICIENT_FINISHER: "Efficient scorer",
  TWO_WAY_CONTRIBUTOR: "Two-way contributor on both ends of the floor",
  ALL_ROUND_CONTRIBUTOR: "All-round contributor without one standout category",
};

const NOTABLE_THRESHOLD = 1.15;

export function playerStatisticalIdentity(dna: PlayerDna): string {
  if (dna.qualification !== "QUALIFIED") {
    return "Developing sample — more games required for a reliable statistical profile.";
  }
  const { primary, secondaryTrait } = computePlayerArchetype(dna);
  if (!primary) {
    return "Balanced statistical profile without a standout category this season.";
  }
  const base = ARCHETYPE_SENTENCE[primary];
  if (secondaryTrait) {
    return `${base}, with above-league ${PLAYER_DNA_DIMENSION_LABEL[secondaryTrait].toLowerCase()}.`;
  }
  return `${base}.`;
}

export type PlayerStrength = { dimension: PlayerDnaDimensionKey; label: string; index: number; playerValue: string; leagueAverage: string };

// Up to 3 dimensions where the player is genuinely above league average (index > 1.15),
// ranked by index — the same threshold used for archetypes/tags elsewhere, kept consistent.
export function playerStrengths(dna: PlayerDna, limit = 3): PlayerStrength[] {
  if (dna.qualification !== "QUALIFIED") return [];
  return dna.dimensions
    .filter((d) => d.index != null && d.index >= NOTABLE_THRESHOLD)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, limit)
    .map((d) => ({ dimension: d.key, label: PLAYER_DNA_DIMENSION_LABEL[d.key], index: d.index as number, playerValue: d.playerValue, leagueAverage: d.leagueAverage }));
}

// Dimensions genuinely below league average (index < 1.0), for a neutral "Developing Areas"
// section — never using judgmental language, and never shown for an unqualified sample.
export function playerDevelopingAreas(dna: PlayerDna, limit = 2): PlayerStrength[] {
  if (dna.qualification !== "QUALIFIED") return [];
  return dna.dimensions
    .filter((d) => d.index != null && d.index < 1.0)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, limit)
    .map((d) => ({ dimension: d.key, label: PLAYER_DNA_DIMENSION_LABEL[d.key], index: d.index as number, playerValue: d.playerValue, leagueAverage: d.leagueAverage }));
}
