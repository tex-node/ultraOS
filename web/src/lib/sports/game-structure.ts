// Game structure: the period/clock shape a game is played under, and how to label periods.
//
// Historically this was hardcoded (ULTRA_RULES: 2 halves, 600s, running clock) and applied to every
// game, which is why basketball could only ever be Ultra Basketball. Structure is now resolved per
// game from the effective rule values and frozen into the rule snapshot at kick-off.

import type { SportDefinition } from "./types";

export type ClockModeValue = "RUNNING" | "STOPPAGE";

export type GameStructure = {
  periodCount: number;
  periodSeconds: number;
  overtimeSeconds: number;
  shotClockSeconds: number;
  clockMode: ClockModeValue;
};

// What every game without explicit structure has always played under (Ultra Basketball).
export const LEGACY_STRUCTURE: GameStructure = {
  periodCount: 2,
  periodSeconds: 600,
  overtimeSeconds: 300,
  shotClockSeconds: 20,
  clockMode: "RUNNING",
};

function positiveInt(value: unknown, fallback: number): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.trunc(numeric);
}

export function isClockMode(value: unknown): value is ClockModeValue {
  return value === "RUNNING" || value === "STOPPAGE";
}

export function normalizeClockMode(value: unknown): ClockModeValue {
  return isClockMode(value) ? value : "RUNNING";
}

// Builds the structure from a sport's structure spec plus its (possibly overridden) rule values.
// PERIOD_COUNT / PERIOD_MINUTES / OVERTIME_MINUTES / SHOT_CLOCK_SECONDS / CLOCK_MODE take
// precedence over the definition's structure defaults when present.
export function structureFromRules(input: {
  structure: SportDefinition["structure"];
  rules?: Record<string, unknown>;
}): GameStructure {
  const rules = input.rules ?? {};
  const periodCount = positiveInt(rules.PERIOD_COUNT, input.structure.periodCount);
  const periodMinutes = positiveInt(rules.PERIOD_MINUTES, Math.round(input.structure.periodDurationSeconds / 60));
  const overtimeMinutes = positiveInt(
    rules.OVERTIME_MINUTES,
    Math.round(input.structure.overtimeDurationSeconds / 60),
  );
  const shotClockSeconds = positiveInt(
    rules.SHOT_CLOCK_SECONDS,
    input.structure.shotClockSeconds ?? LEGACY_STRUCTURE.shotClockSeconds,
  );

  return {
    periodCount,
    periodSeconds: periodMinutes * 60,
    overtimeSeconds: overtimeMinutes * 60,
    shotClockSeconds,
    clockMode: normalizeClockMode(rules.CLOCK_MODE ?? input.structure.clock),
  };
}

// "Q3" for a four-quarter game, "HALF 1" for a two-half game, "OT1" once the periods are exhausted.
export function periodLabelFor(period: number, status: string, structure: Pick<GameStructure, "periodCount">): string {
  if (status === "FINAL") return "FINAL";
  const count = Math.max(1, Math.trunc(structure.periodCount));
  if (period > count) return `OT${period - count}`;
  if (count === 4) return `Q${period}`;
  if (count === 2) return period === 1 ? "HALF 1" : "HALF 2";
  return `P${period}`;
}

export function isFinalPeriod(period: number, structure: Pick<GameStructure, "periodCount">): boolean {
  return period >= structure.periodCount;
}

export function clockModeLabel(mode: ClockModeValue): string {
  return mode === "STOPPAGE" ? "Stopped clock" : "Running clock";
}

export function clockModeHint(mode: ClockModeValue): string {
  return mode === "STOPPAGE"
    ? "Stop the clock at every whistle (foul, out of bounds, violation) and start it again on the restart."
    : "The clock keeps running through whistles. Pause only for timeouts and injuries.";
}
