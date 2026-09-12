// Pure normalization helpers for team-registration duplicate detection.
// Deliberately no side effects and no database access so they are unit-testable.

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDateOfBirth(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// A possible-match key used only where no shared athlete identity exists.
// This is a MATCH CANDIDATE, never an automatic merge decision - callers must
// route a hit to manual review.
export function participantMatchKey(fullName: string, dateOfBirth: string | Date | null | undefined): string | null {
  const name = normalizeName(fullName);
  const dob = normalizeDateOfBirth(dateOfBirth);
  if (!name || !dob) return null;
  return `${name}|${dob}`;
}
