import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  buildCountingStatDeltaData,
  type CountingStatField,
  type UltraTimeCountingStatField,
} from "@/lib/scoring/counting-stat-delta";

export type { CountingStatField, UltraTimeCountingStatField };

// New primitive (A3a Batch 10b), not a relocation: recordStatEvent's counting-stat write was
// never a shot-delta merge, so it doesn't belong in applyShotStatDeltas - it increments exactly
// one field, plus its Ultra-Time mirror when applicable. `field`/`ultraTime.field` are typed
// unions, not a raw string parameter, so the whitelist is enforced at compile time rather than
// trusted at the call site - the same closed set STAT_FIELD/ULTRA_TIME_STAT_FIELD in actions.ts
// already define. The upsert data shape itself lives in buildCountingStatDeltaData
// (src/lib/scoring/counting-stat-delta.ts, pure, unit-tested) - this function is only the I/O:
// read the existing Ultra-Time value, build the payload, upsert.
export async function applyCountingStatDelta(
  tx: Prisma.TransactionClient,
  organizationId: string,
  gameId: string,
  playerId: string,
  seasonClubId: string,
  field: CountingStatField,
  delta: number,
  ultraTime: { field: UltraTimeCountingStatField; delta: number } | null,
) {
  const existing = ultraTime
    ? await tx.playerStat.findUnique({ where: { gameId_playerId: { gameId, playerId } } })
    : null;
  const { create, update } = buildCountingStatDeltaData(
    field,
    delta,
    ultraTime ? { ...ultraTime, existingValue: existing?.[ultraTime.field] ?? 0 } : null,
  );
  await tx.playerStat.upsert({
    where: { gameId_playerId: { gameId, playerId } },
    create: { organizationId, gameId, playerId, seasonClubId, ...create, statSource: "ULTRA_NATIVE_LIVE_SCORER" },
    update: { ...update, statSource: "ULTRA_NATIVE_LIVE_SCORER" },
  });
}
