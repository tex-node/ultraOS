// Pure builder for the counting-stat upsert payload (rebounds/assists/steals/blocks/turnovers/
// fouls, plus each one's Ultra-Time mirror). Split from applyCountingStatDelta the same way
// buildGameEventCreateData is split from createGameEvent - no Prisma, no server-only, so the
// field-shape logic is unit-testable without a database. The existing Ultra-Time value has to be
// read from the row before this runs (Prisma's `increment` can't be mixed with the conditional
// mirror field in one upsert clause), so it's a parameter here, not something this function reads.

export type CountingStatField = "rebounds" | "assists" | "steals" | "blocks" | "turnovers" | "fouls";
export type UltraTimeCountingStatField =
  | "ultraTimeRebounds"
  | "ultraTimeAssists"
  | "ultraTimeSteals"
  | "ultraTimeBlocks"
  | "ultraTimeTurnovers"
  | "ultraTimeFouls";

export interface UltraTimeCountingStatDelta {
  field: UltraTimeCountingStatField;
  delta: number;
  existingValue: number;
}

export interface CountingStatUpsertData {
  create: Partial<Record<CountingStatField | UltraTimeCountingStatField, number>>;
  update: Partial<Record<CountingStatField, { increment: number }> & Record<UltraTimeCountingStatField, number>>;
}

// `delta` is signed, not a direction flag, so the same shape serves both an increment
// (recordStatEvent, always +1) and a future reversal (undoLastEvent's generic branch, Batch 12)
// without a separate code path. No floor-at-zero clamping - that's a caller decision.
export function buildCountingStatDeltaData(
  field: CountingStatField,
  delta: number,
  ultraTime: UltraTimeCountingStatDelta | null,
): CountingStatUpsertData {
  return {
    create: {
      [field]: delta,
      ...(ultraTime ? { [ultraTime.field]: ultraTime.delta } : {}),
    },
    update: {
      [field]: { increment: delta },
      ...(ultraTime ? { [ultraTime.field]: ultraTime.existingValue + ultraTime.delta } : {}),
    },
  };
}
