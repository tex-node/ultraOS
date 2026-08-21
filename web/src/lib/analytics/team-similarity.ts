import { SIMILARITY_BAND_LABEL, type SimilarityBand } from "./player-similarity";
import type { TeamDna, TeamDnaDimensionKey } from "./team-dna";

// Same normalized-Euclidean-distance approach as Player Similarity, applied to Team DNA's 9
// dimensions instead of Player DNA's 6. See player-similarity.ts for the full method writeup —
// the reasoning (shared 1.0-centered index space, Euclidean over cosine, band calibration) is
// identical and intentionally not duplicated here beyond this pointer.
export { SIMILARITY_BAND_LABEL };

const BAND_THRESHOLDS: { band: SimilarityBand; maxDistance: number }[] = [
  { band: "VERY_SIMILAR", maxDistance: 0.15 },
  { band: "SIMILAR", maxDistance: 0.35 },
  { band: "SOME_OVERLAP", maxDistance: 0.6 },
  { band: "DIFFERENT_PROFILE", maxDistance: Infinity },
];

export type TeamSimilarityMatch = {
  seasonClubId: string;
  distance: number;
  band: SimilarityBand;
  sharedDimensions: number;
  mostSimilarDimension: TeamDnaDimensionKey | null;
  mostDifferentDimension: TeamDnaDimensionKey | null;
};

function sharedIndexPairs(a: TeamDna, b: TeamDna) {
  const pairs: { key: TeamDnaDimensionKey; a: number; b: number }[] = [];
  for (const dimA of a.dimensions) {
    const dimB = b.dimensions.find((d) => d.key === dimA.key);
    if (dimA.index == null || dimB?.index == null) continue;
    pairs.push({ key: dimA.key, a: dimA.index, b: dimB.index });
  }
  return pairs;
}

function bandFor(distance: number): SimilarityBand {
  return BAND_THRESHOLDS.find((t) => distance <= t.maxDistance)!.band;
}

export function findSimilarTeams(seasonClubId: string, dnaByTeam: Map<string, TeamDna>, limit = 2): TeamSimilarityMatch[] {
  const target = dnaByTeam.get(seasonClubId);
  if (!target || target.qualification !== "QUALIFIED") return [];

  const matches: TeamSimilarityMatch[] = [];
  for (const [otherId, otherDna] of dnaByTeam) {
    if (otherId === seasonClubId) continue;
    if (otherDna.qualification !== "QUALIFIED") continue;
    const pairs = sharedIndexPairs(target, otherDna);
    if (pairs.length === 0) continue;
    const distance = Math.sqrt(pairs.reduce((sum, p) => sum + (p.a - p.b) ** 2, 0) / pairs.length);
    let mostSimilar: { key: TeamDnaDimensionKey; gap: number } | null = null;
    let mostDifferent: { key: TeamDnaDimensionKey; gap: number } | null = null;
    for (const p of pairs) {
      const gap = Math.abs(p.a - p.b);
      if (mostSimilar == null || gap < mostSimilar.gap) mostSimilar = { key: p.key, gap };
      if (mostDifferent == null || gap > mostDifferent.gap) mostDifferent = { key: p.key, gap };
    }
    matches.push({
      seasonClubId: otherId,
      distance,
      band: bandFor(distance),
      sharedDimensions: pairs.length,
      mostSimilarDimension: mostSimilar?.key ?? null,
      mostDifferentDimension: mostDifferent?.key ?? null,
    });
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
