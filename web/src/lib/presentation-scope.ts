// Single source of truth for "this Fixture is visible on normal production public/broadcast/
// graphics surfaces" (G.19, Part III). Found via the G.18 rehearsal: a REHEARSAL-origin fixture
// could briefly surface on `/live` because that page's discovery query filtered by Game.status
// (LIVE/PAUSED) alone, never by Fixture.recordOrigin.
//
// This is presentation visibility, a distinct concern from competitive eligibility
// (competitive-scope.ts - whether a fixture counts toward standings/records/leaderboards). Until
// 2026-09-22 the two questions had the identical answer (only PRODUCTION passes), so this
// delegated to competitiveFixtureScope() rather than re-declaring a second allow-list. That
// changed when src/lib/external-stats-ingestion.ts started creating IMPORT-origin fixtures for
// real, officially completed games transcribed from an external box score after the fact (e.g.
// the Lagos Basketball Community League): those games are competitive (they must count toward
// standings) but were never live-produced through Neon Ultra's own broadcast pipeline, so they
// have no business surfacing on `/live`, `/broadcast/stats`, or a broadcast graphic. Presentation
// visibility therefore keeps its own PRODUCTION-only allow-list rather than following
// competitive-scope.ts's now-wider one.
//
// Allow-list semantics (recordOrigin === PRODUCTION), not a deny-list of REHEARSAL: RecordOrigin
// also has SYSTEM/DEMO/IMPORT/APPLICATION/ADMIN/ADMIN_OFFLINE_INTAKE, none of which should ever
// reach a spectator or a broadcast graphic either. A deny-list of just REHEARSAL would silently
// leak any of those.
const PRODUCTION_PRESENTATION_RECORD_ORIGIN = "PRODUCTION" as const;

// Spread into a `fixture: { ... }` (or `game: { fixture: { ... } }`) Prisma where-clause on any
// query that DISCOVERS live/current/recent games for a public or broadcast surface - `/live`,
// `/broadcast/stats`, broadcast graphics routes, record-watch/milestone loaders (though those
// inherit isolation for free by only ever running against an already-scoped game id).
export function productionPresentationFixtureWhere() {
  return { recordOrigin: PRODUCTION_PRESENTATION_RECORD_ORIGIN };
}

// The same decision as a plain predicate over an already-loaded fixture, for routes that resolve
// a single fixture/game by id (e.g. a browser-source graphic hit directly by URL) rather than
// running a discovery query - those must still refuse to render a non-PRODUCTION fixture, since
// the URL could be a stale rehearsal link or a guessed id.
export function isProductionPresentationFixture(fixture: { recordOrigin: string }): boolean {
  return fixture.recordOrigin === PRODUCTION_PRESENTATION_RECORD_ORIGIN;
}
