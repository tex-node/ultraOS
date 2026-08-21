import type { PlayerDna, PlayerDnaDimensionKey } from "./player-dna";

// Explainable statistical similarity — NOT machine learning. Two players are compared as
// vectors of their Player DNA indices (each already normalized to "1.00 = league average"), so
// a raw per-dimension difference is directly meaningful without further scaling.
//
// Distance method: normalized Euclidean distance over whichever DNA dimensions BOTH players
// have a real (non-null) index for — dimensions missing for either player are excluded rather
// than treated as 0, so a small-sample gap in one stat can't manufacture a false "very
// different" reading. Euclidean was chosen over cosine similarity because these vectors already
// share a meaningful common origin (1.0 = average in every dimension) — cosine similarity is
// about vector *direction* from the coordinate origin (0), which isn't the interesting question
// here; the interesting question is "how far apart are these two players' actual rates,"
// which Euclidean distance over the shared dimensions answers directly.
//
//   distance = sqrt( sum( (indexA_i - indexB_i)^2 ) / n )   over n shared dimensions
//
// Bands are calibrated to the spread actually observed across Season Zero's Player DNA indices,
// not a universal statistical standard — see the methods doc for the reasoning.
export type SimilarityBand = "VERY_SIMILAR" | "SIMILAR" | "SOME_OVERLAP" | "DIFFERENT_PROFILE";

const BAND_THRESHOLDS: { band: SimilarityBand; maxDistance: number }[] = [
  { band: "VERY_SIMILAR", maxDistance: 0.15 },
  { band: "SIMILAR", maxDistance: 0.35 },
  { band: "SOME_OVERLAP", maxDistance: 0.6 },
  { band: "DIFFERENT_PROFILE", maxDistance: Infinity },
];

export const SIMILARITY_BAND_LABEL: Record<SimilarityBand, string> = {
  VERY_SIMILAR: "Very Similar",
  SIMILAR: "Similar",
  SOME_OVERLAP: "Some Overlap",
  DIFFERENT_PROFILE: "Different Profile",
};

export type PlayerSimilarityMatch = {
  playerId: string;
  distance: number;
  band: SimilarityBand;
  sharedDimensions: number;
  mostSimilarDimension: PlayerDnaDimensionKey | null;
  mostDifferentDimension: PlayerDnaDimensionKey | null;
};

function sharedIndexPairs(a: PlayerDna, b: PlayerDna): { key: PlayerDnaDimensionKey; a: number; b: number }[] {
  const pairs: { key: PlayerDnaDimensionKey; a: number; b: number }[] = [];
  for (const dimA of a.dimensions) {
    const dimB = b.dimensions.find((d) => d.key === dimA.key);
    if (dimA.index == null || dimB?.index == null) continue;
    pairs.push({ key: dimA.key, a: dimA.index, b: dimB.index });
  }
  return pairs;
}

export function computePlayerDistance(a: PlayerDna, b: PlayerDna): { distance: number; sharedDimensions: number; mostSimilarDimension: PlayerDnaDimensionKey | null; mostDifferentDimension: PlayerDnaDimensionKey | null } | null {
  const pairs = sharedIndexPairs(a, b);
  if (pairs.length === 0) return null;
  const sumSquares = pairs.reduce((sum, p) => sum + (p.a - p.b) ** 2, 0);
  const distance = Math.sqrt(sumSquares / pairs.length);

  let mostSimilar: { key: PlayerDnaDimensionKey; gap: number } | null = null;
  let mostDifferent: { key: PlayerDnaDimensionKey; gap: number } | null = null;
  for (const p of pairs) {
    const gap = Math.abs(p.a - p.b);
    if (mostSimilar == null || gap < mostSimilar.gap) mostSimilar = { key: p.key, gap };
    if (mostDifferent == null || gap > mostDifferent.gap) mostDifferent = { key: p.key, gap };
  }

  return { distance, sharedDimensions: pairs.length, mostSimilarDimension: mostSimilar?.key ?? null, mostDifferentDimension: mostDifferent?.key ?? null };
}

function bandFor(distance: number): SimilarityBand {
  return BAND_THRESHOLDS.find((t) => distance <= t.maxDistance)!.band;
}

// Ranked, closest-first similarity matches for `playerId` among `candidates` (a Map of
// playerId -> PlayerDna, typically every QUALIFIED player in the season). The player never
// matches themselves, and only QUALIFIED candidates are considered — comparing against a
// 1-game outlier's DNA would produce a "similarity" that isn't statistically meaningful.
export function findSimilarPlayers(playerId: string, dnaByPlayer: Map<string, PlayerDna>, limit = 3): PlayerSimilarityMatch[] {
  const target = dnaByPlayer.get(playerId);
  if (!target || target.qualification !== "QUALIFIED") return [];

  const matches: PlayerSimilarityMatch[] = [];
  for (const [otherId, otherDna] of dnaByPlayer) {
    if (otherId === playerId) continue;
    if (otherDna.qualification !== "QUALIFIED") continue;
    const result = computePlayerDistance(target, otherDna);
    if (!result) continue;
    matches.push({ playerId: otherId, ...result, band: bandFor(result.distance) });
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
