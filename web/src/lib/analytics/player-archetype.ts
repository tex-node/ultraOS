import type { PlayerDna, PlayerDnaDimensionKey } from "./player-dna";

// Deterministic archetype labels derived purely from Player DNA index thresholds — no
// judgment call, no LLM. A player below the DNA qualification bar never receives an archetype;
// "DEVELOPING_SAMPLE" is returned instead and must be the only thing shown for them.

export type PlayerArchetype =
  | "PRIMARY_SCORER" | "REBOUNDING_FORCE" | "PLAYMAKING_GUARD" | "DEFENSIVE_DISRUPTOR"
  | "EFFICIENT_FINISHER" | "TWO_WAY_CONTRIBUTOR" | "ALL_ROUND_CONTRIBUTOR";

export const PLAYER_ARCHETYPE_LABEL: Record<PlayerArchetype, string> = {
  PRIMARY_SCORER: "Primary Scorer",
  REBOUNDING_FORCE: "Rebounding Force",
  PLAYMAKING_GUARD: "Playmaking Guard",
  DEFENSIVE_DISRUPTOR: "Defensive Disruptor",
  EFFICIENT_FINISHER: "Efficient Finisher",
  TWO_WAY_CONTRIBUTOR: "Two-Way Contributor",
  ALL_ROUND_CONTRIBUTOR: "All-Round Contributor",
};

// Threshold at which a single dimension is considered dominant enough to define an archetype —
// same 15%-above-average bar used for Team DNA tags, kept consistent across the codebase.
const DOMINANT_THRESHOLD = 1.3;
const NOTABLE_THRESHOLD = 1.15;
const OFFENSE_DIMENSIONS: PlayerDnaDimensionKey[] = ["SCORING", "PLAYMAKING", "REBOUNDING", "SHOOTING"];

export type ArchetypeResult = {
  primary: PlayerArchetype | null;
  secondaryTrait: PlayerDnaDimensionKey | null;
};

function indexOf(dna: PlayerDna, key: PlayerDnaDimensionKey): number | null {
  return dna.dimensions.find((d) => d.key === key)?.index ?? null;
}

export function computePlayerArchetype(dna: PlayerDna): ArchetypeResult {
  if (dna.qualification !== "QUALIFIED") return { primary: null, secondaryTrait: null };

  const dominant = [...dna.dimensions]
    .filter((d) => d.index != null && d.index >= DOMINANT_THRESHOLD)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0];

  let primary: PlayerArchetype | null = null;
  if (dominant) {
    switch (dominant.key) {
      case "SCORING": primary = "PRIMARY_SCORER"; break;
      case "REBOUNDING": primary = "REBOUNDING_FORCE"; break;
      case "PLAYMAKING": primary = "PLAYMAKING_GUARD"; break;
      case "DEFENSIVE_ACTIVITY": primary = "DEFENSIVE_DISRUPTOR"; break;
      case "SHOOTING": primary = "EFFICIENT_FINISHER"; break;
      case "BALL_SECURITY": primary = null; break; // not treated as a standalone archetype driver
    }
  }

  if (!primary) {
    const offenseNotable = OFFENSE_DIMENSIONS.some((k) => (indexOf(dna, k) ?? 0) >= NOTABLE_THRESHOLD);
    const defenseNotable = (indexOf(dna, "DEFENSIVE_ACTIVITY") ?? 0) >= NOTABLE_THRESHOLD;
    if (offenseNotable && defenseNotable) {
      primary = "TWO_WAY_CONTRIBUTOR";
    } else {
      // Strictly above 1.0, not >= — a player sitting exactly at league average in everything
      // has no real distinguishing strength and should receive no archetype at all, not a
      // flattering "all-round" label for being average.
      const aboveAverageCount = dna.dimensions.filter((d) => d.index != null && d.index > 1.0).length;
      if (aboveAverageCount >= 3) primary = "ALL_ROUND_CONTRIBUTOR";
    }
  }

  const primaryKey = dominant?.key ?? null;
  const secondaryTrait = [...dna.dimensions]
    .filter((d) => d.key !== primaryKey && d.index != null && d.index >= NOTABLE_THRESHOLD)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0]?.key ?? null;

  return { primary, secondaryTrait };
}
