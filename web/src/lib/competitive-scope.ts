// Single source of truth for "this Fixture belongs to real competitive production," not a
// rehearsal, demo, or other non-competitive record (G.16, Part III). G.15's rehearsal
// discovered that recalculateStandings() aggregated FINAL fixtures by season/status alone,
// with no isolation from a REHEARSAL-origin fixture in the same season — the rehearsal was
// redesigned to never finalize specifically to avoid this, rather than trusting the query to
// exclude it. This constant (and the query fragments below) close that gap at the source: every
// season-wide aggregator that sums/ranks across multiple games must filter on it, so a future
// rehearsal, novelty test fixture, or any other non-allow-listed-origin Fixture can safely reach
// FINAL status without silently entering standings, leaderboards, records, milestones, or
// team/player DNA.
//
// Deliberately an allow-list, not a deny-list of "REHEARSAL" - a future RecordOrigin value
// nobody has added an exclusion for yet still fails safe. "IMPORT" was added 2026-09-22
// alongside src/lib/external-stats-ingestion.ts: those fixtures are real, officially completed
// games (e.g. the Lagos Basketball Community League) transcribed from an external box score
// after the fact, not a rehearsal/demo/test artifact - excluding them left every imported
// tournament's standings permanently zeroed. IMPORT is used nowhere else in this codebase.
export const COMPETITIVE_FIXTURE_RECORD_ORIGINS = ["PRODUCTION", "IMPORT"] as const;

// Spread into a `fixture: { ... }` (or `game: { fixture: { ... } }`) Prisma where-clause
// alongside whatever other conditions that level already has, e.g.:
//   where: { status: "FINAL", fixture: { seasonId, ...competitiveFixtureScope() } }
export function competitiveFixtureScope() {
  return { recordOrigin: { in: [...COMPETITIVE_FIXTURE_RECORD_ORIGINS] } };
}

// The same decision, as a plain predicate over an already-loaded fixture - lets the exact
// inclusion/exclusion logic be unit tested without a database connection (the Prisma-side
// query fragment above can only be proven correct against a real database, via the isolated
// rehearsal; this predicate is what that query fragment is logically equivalent to).
export function isCompetitiveFixture(fixture: { recordOrigin: string }): boolean {
  return (COMPETITIVE_FIXTURE_RECORD_ORIGINS as readonly string[]).includes(fixture.recordOrigin);
}
