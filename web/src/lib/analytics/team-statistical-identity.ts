import { TEAM_DNA_DIMENSION_LABEL, type TeamDna, type TeamDnaDimensionKey } from "./team-dna";

// Deterministic plain-English team identity, built from the same Team DNA dimensions already
// shown in the Team DNA bars — never a second independent rule set. No runtime LLM call.

const NOTABLE_THRESHOLD = 1.15;

const DIMENSION_PHRASE: Record<TeamDnaDimensionKey, string> = {
  SCORING: "high-scoring",
  SHOOTING: "efficient shooting",
  PLAYMAKING: "ball-movement-driven",
  REBOUNDING: "strong rebounding",
  DEFENSE: "defense-led",
  TRANSITION: "transition-heavy",
  PAINT_ATTACK: "paint-scoring",
  BENCH_PRODUCTION: "bench-driven",
  BALL_SECURITY: "low-turnover",
};

export function teamStatisticalIdentity(dna: TeamDna): string {
  if (dna.qualification !== "QUALIFIED") {
    return "Developing sample — more games required for a reliable team profile.";
  }
  const notable = dna.dimensions
    .filter((d) => d.index != null && d.index >= NOTABLE_THRESHOLD)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

  if (notable.length === 0) {
    return "Balanced statistical profile without one standout category this season.";
  }
  if (notable.length === 1) {
    return `A ${DIMENSION_PHRASE[notable[0].key]} team this season.`;
  }
  return `A ${DIMENSION_PHRASE[notable[0].key]} team with ${DIMENSION_PHRASE[notable[1].key].replace(/^(low|high)-/, "")} production.`;
}

export type TeamStrength = { dimension: TeamDnaDimensionKey; label: string; index: number; teamValue: string; leagueAverage: string };

export function teamStrengths(dna: TeamDna, limit = 3): TeamStrength[] {
  if (dna.qualification !== "QUALIFIED") return [];
  return dna.dimensions
    .filter((d) => d.index != null && d.index >= NOTABLE_THRESHOLD)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, limit)
    .map((d) => ({ dimension: d.key, label: TEAM_DNA_DIMENSION_LABEL[d.key], index: d.index as number, teamValue: d.teamValue, leagueAverage: d.leagueAverage }));
}

// "Below Season Zero Average" — neutral framing, never "weaknesses." At most 2, per spec.
export function teamBelowAverage(dna: TeamDna, limit = 2): TeamStrength[] {
  if (dna.qualification !== "QUALIFIED") return [];
  return dna.dimensions
    .filter((d) => d.index != null && d.index < 1.0)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, limit)
    .map((d) => ({ dimension: d.key, label: TEAM_DNA_DIMENSION_LABEL[d.key], index: d.index as number, teamValue: d.teamValue, leagueAverage: d.leagueAverage }));
}
