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
