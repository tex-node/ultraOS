// Single source of truth for "this Fixture is visible on normal production public/broadcast/
// graphics surfaces" (G.19, Part III). Found via the G.18 rehearsal: a REHEARSAL-origin fixture
// could briefly surface on `/live` because that page's discovery query filtered by Game.status
// (LIVE/PAUSED) alone, never by Fixture.recordOrigin.
//
// This is presentation visibility, a distinct concern from competitive eligibility
// (competitive-scope.ts - whether a fixture counts toward standings/records/leaderboards) - a
// future RecordOrigin could conceivably be competitive but not public-presentable, or vice
// versa. Today the two questions happen to have the identical answer (only PRODUCTION passes),
// so this deliberately delegates to competitiveFixtureScope() rather than re-declaring a second
// allow-list that could silently drift from it - "do not duplicate scope logic across pages"
// applies to this file's relationship with competitive-scope.ts just as much as it applies to
// every page that imports this file.
//
// Allow-list semantics (recordOrigin === PRODUCTION), not a deny-list of REHEARSAL: RecordOrigin
// also has SYSTEM/DEMO/IMPORT/APPLICATION/ADMIN/ADMIN_OFFLINE_INTAKE, none of which should ever
// reach a spectator or a broadcast graphic either. A deny-list of just REHEARSAL would silently
// leak any of those.
import { competitiveFixtureScope, isCompetitiveFixture } from "./competitive-scope";

// Spread into a `fixture: { ... }` (or `game: { fixture: { ... } }`) Prisma where-clause on any
// query that DISCOVERS live/current/recent games for a public or broadcast surface - `/live`,
// `/broadcast/stats`, broadcast graphics routes, record-watch/milestone loaders (though those
// inherit isolation for free by only ever running against an already-scoped game id).
export function productionPresentationFixtureWhere() {
  return competitiveFixtureScope();
}

// The same decision as a plain predicate over an already-loaded fixture, for routes that resolve
// a single fixture/game by id (e.g. a browser-source graphic hit directly by URL) rather than
// running a discovery query - those must still refuse to render a non-PRODUCTION fixture, since
// the URL could be a stale rehearsal link or a guessed id.
export function isProductionPresentationFixture(fixture: { recordOrigin: string }): boolean {
  return isCompetitiveFixture(fixture);
}
