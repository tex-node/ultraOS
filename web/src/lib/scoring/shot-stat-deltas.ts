import type { ShotStatDeltas } from "@/lib/ultra-scoring-engine";

// Pure merge logic for applyPlayerShotStatDeltas/applyTeamShotStatDeltas (src/server/scoring/
// applyShotStatDeltas.ts) - lives here, not there, because it's genuinely pure (no Prisma, no
// server-only) and testable without a database, same split as buildGameEventCreateData vs
// createGameEvent. NULL fields become real zeros the first time a native shot touches this row,
// per the "0 is captured, null is not" convention - correct here because live scoring genuinely
// observes every shot category.
export function mergeShotStatDeltas(
  existing: Partial<Record<keyof ShotStatDeltas, number | null>> | null,
  deltas: ShotStatDeltas,
): Record<keyof ShotStatDeltas, number> {
  const merged = {} as Record<keyof ShotStatDeltas, number>;
  for (const key of Object.keys(deltas) as (keyof ShotStatDeltas)[]) {
    merged[key] = (existing?.[key] ?? 0) + deltas[key];
  }
  return merged;
}
