// Schedule slot allocation. Pure: the caller supplies the "is this slot taken?" predicate, so the
// rule can be unit-tested without a database.
//
// A round's fixtures all start from the same base time; each fixture takes the first free slot at or
// after that base, stepping forward by the slot length. This lets several matches share one venue on
// the same day instead of every match after the first being dropped as a conflict.

export type SlotAllocation = { scheduledAt: Date; conflict: boolean };

export const DEFAULT_SLOT_ATTEMPTS = 48;

export function allocateSlot(input: {
  base: Date;
  stepMs: number;
  isTaken: (scheduledAt: Date) => boolean;
  maxAttempts?: number;
}): SlotAllocation {
  const step = Math.max(1, Math.trunc(input.stepMs));
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? DEFAULT_SLOT_ATTEMPTS));
  let candidate = input.base;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!input.isTaken(candidate)) return { scheduledAt: candidate, conflict: false };
    candidate = new Date(candidate.getTime() + step);
  }
  // Everything within the search window is booked - report a genuine conflict rather than silently
  // placing the fixture on top of another.
  return { scheduledAt: input.base, conflict: true };
}

const DAY_MS = 86_400_000;

export const WEEKDAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

// Accepts weekday names ("SAT"), numbers ("6") or mixed, and returns sorted unique weekday numbers
// (0 = Sunday .. 6 = Saturday). Junk values are ignored.
export function parseGameDays(values: Array<string | number>): number[] {
  const days = new Set<number>();
  for (const value of values) {
    const key = String(value).trim().toUpperCase();
    if (key === "") continue; // Number("") is 0, which would silently mean Sunday
    if (key in WEEKDAY_NAMES) {
      days.add(WEEKDAY_NAMES[key]);
      continue;
    }
    const numeric = Number(key);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) days.add(numeric);
  }
  return [...days].sort((a, b) => a - b);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// The play dates for one round. With no game days selected this is just the nominal day (the historic
// behaviour). Otherwise it is every allowed weekday from the nominal day within the round window; if
// the window contains none (e.g. a one-day window that is not a play day), the next allowed day is
// used so a fixture is never silently dropped.
export function playDatesForRound(input: {
  nominal: Date;
  gameDays: number[];
  windowDays?: number;
}): Date[] {
  const nominal = startOfUtcDay(input.nominal);
  const days = [...new Set(input.gameDays.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
  if (days.length === 0) return [nominal];

  const windowDays = Math.max(1, Math.trunc(input.windowDays ?? 1));
  const dates: Date[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const candidate = new Date(nominal.getTime() + offset * DAY_MS);
    if (days.includes(candidate.getUTCDay())) dates.push(candidate);
  }
  if (dates.length > 0) return dates;

  for (let offset = windowDays; offset < windowDays + 7; offset += 1) {
    const candidate = new Date(nominal.getTime() + offset * DAY_MS);
    if (days.includes(candidate.getUTCDay())) return [candidate];
  }
  return [nominal];
}

