---
title: External Stats Ingestion & Cross-Organization Tournament Aggregation
status: Active
version: 1.0
last_updated: 2026-09-22
---

# External Stats Ingestion & Cross-Organization Tournament Aggregation

## 1. Purpose

A reusable pipeline for onboarding a real-world tournament whose games are scored **outside
ultraOS** — a paper or PDF FIBA/Genius-Sports-style box score, photographed or screenshotted
and transcribed after the fact — rather than live-scored through the platform's own scorer
console. This is the first step toward the platform aggregating other sporting events
alongside Neon Ultra: any organization can get its own tournament onto the site without a
live-scoring integration, and the homepage surfaces ongoing tournaments across every active
organization, not just Neon Ultra.

The pilot is the **Lagos Basketball Community League (LBCL)**, onboarded 2026-09-22 with its
first 9 games (see `session.md`, 2026-09-22 entry, for the full writeup and the identity
reconciliation decisions flagged for operator review).

## 2. What this is not

- **Not OCR.** The pipeline takes a transcribed JSON file, not an image. Reading the
  photographed sheet is a human (or an agent reading the sheet) task; keeping that
  error-prone step as a reviewable, human-legible JSON artifact — rather than a black box —
  is deliberate. See `src/lib/external-stats-ingestion.ts`'s top-of-file comment.
- **Not a replacement for `/t/[slug]`.** Neon Ultra's own tournament sub-site
  (`/t/[slug]`) stays Neon-Ultra-only by design (`resolveDefaultPublicOrganization`'s doc
  comment calls this "Pattern A" and explicitly says not to extend it for a second
  organization). This pipeline adds a **separate, additive** short-URL mechanism
  (`/[vanitySlug]`) for every other organization instead.

## 3. Data flow

```
photographed/screenshotted box score
        │  (human or agent transcribes)
        ▼
batch JSON  { organization, actorId, games: IngestBoxScoreInput[] }
        │  scripts/external-stats-ingest.ts  (dry-run by default; --apply to write)
        ▼
ingestBoxScoreGame()  (src/lib/external-stats-ingestion.ts)
        │
        ├─ ensureOrganizationForIngestion   (mode "new" | "existing")
        ├─ ensureCompetition / ensureDivision / ensureSeason / ensureVenue
        ├─ ensureClub × 2, ensureSeasonClub × 2
        ├─ ensurePlayer × N   (per roster line, both teams)
        ├─ ensureFixture
        ├─ registerVanityTournamentSlug()   (opt-in, once per competition)
        └─ importGameResult()   (src/lib/game-result-import.ts — the existing FIBA import
                                  path, now organization-scoped and transaction-aware)
                │
                ▼
        Fixture(FINAL) + Game + GamePeriodScore + TeamStat + PlayerStat + Standing
```

Every `ensure*` function is a find-or-create keyed on a natural identity within its own
scope, so re-running an ingestion for a game already loaded is a safe no-op on the shared
entities (organization/competition/season/venue/clubs/players) and an idempotent upsert on
the game's own result. A fixture already `FINAL` is reported `BLOCKED`, not silently
re-imported — see the "supersede workflow" note in `game-result-import.ts`.

## 4. The batch JSON contract

One file describes one organization's worth of games:

```jsonc
{
  "organization": { "mode": "new", "organization": { "name": "...", "slug": "...", "idPrefixAthlete": "...", "idPrefixStaff": "..." } },
  // or: { "mode": "existing", "organizationId": "..." }
  "actorId": "<a real User id, for the audit log>",
  "games": [ /* IngestBoxScoreInput[] — see external-stats-ingestion.ts */ ]
}
```

`organization.mode` is the "ask if the tournament should be created or add to an existing
tournament" decision from the original request — made explicit and reviewable in the file
rather than an interactive prompt, since a batch like this is transcribed once and then run
non-interactively.

Each game (`IngestBoxScoreInput`) independently carries its own `tournament` (name/slug/
sportSlug/optional `vanitySlug`), `division`, `season`, `venue`, `scheduledAt`,
`homeScore`/`awayScore`, `periods`, and both teams' `home`/`away` lines (`clubName`,
`clubShortName`, `totals`, a required `advanced` block, and `players`). Every player line
requires `reportedName` (used for fuzzy roster matching), `fullName` (used for player
creation), an explicit `didNotPlay: boolean`, and the full FIBA stat line — there is no
optional field a DNP row can skip; DNP rows carry every numeric field as `0`.

`scripts/data/build-lbcl-batch.mjs` is the reference implementation of a builder: it expands
compact per-player tuples (`[fullName, jersey, min, pts, fgm, fga, ...]` or
`[fullName, jersey, "DNP"]`) into the full shape, which is far less error-prone than
hand-writing ~25 keys per player across every roster row. `scripts/data/verify-batch.mjs`
then cross-checks every team's summed player points and quarter-score sums against the
sheet's own reported totals — run this before every `--apply`. For LBCL this caught one real
transcription error (a `didNotPlay` flag on a player who had actually scored) before it
reached the database.

**Advanced team stats are placeholders, not fabricated data.** `ImportTeamAdvanced` (points
from turnovers, fast-break points, biggest lead, points per possession, etc.) is a required
field on the Prisma `TeamStat` model, but a community league's box score rarely prints that
footer table legibly enough to transcribe with confidence at scale. LBCL's batch stores
explicit `0` for every advanced field — clearly a placeholder, not a measured value — while
every box-score fundamental (points, rebounds, assists, shooting splits, fouls, plus/minus,
efficiency) is independently transcribed and checksum-verified per player. If a future
ingestion has clean advanced-stats data, populate `advanced` for real instead of leaving it
zeroed.

## 5. Player identity across multiple games (read this before onboarding game 2+)

`Player` has a `(seasonClubId, jerseyNumber)` unique constraint. A club that plays more than
one game shares **one** `SeasonClub` row across the whole season, so every game's roster for
that club writes into the same jersey-number namespace. Two failure modes to watch for:

1. **The same real person, spelled differently on different sheets.** Community-league box
   scores are hand-typed per game and are not internally consistent — "Dannis Godwill" and
   "Dennis Goodwill" are the same jersey, the same player, two different sheets. `ensurePlayer`
   matches by an exact normalized-name comparison only (letters only, case-insensitive) — it
   does **not** fuzzy-match across games the way `game-result-import.ts`'s own prefix-match
   does within a single game's roster. If you don't reconcile the spelling, the second game's
   ingestion tries to **create** a second player at a jersey the first player already holds,
   and the whole game's transaction fails with a Prisma unique-constraint error.
2. **Two genuinely different real people who happen to share a jersey number across
   different games** (community leagues don't issue permanent bibs). Do not force these
   together. Set `jerseyNumber: null` for the newer entry instead of guessing a number that
   looks safe — `jerseyNumber` is nullable specifically for this case, and a `null` is an
   honest "not confidently known," never a fabricated value.

Practically: before writing a second game for a club that already has a roster in this
organization, list that club's already-created players (name + jersey) and reconcile every
new game's roster line against them by name similarity + jersey, one by one. This is what
`scripts/data/build-lbcl-batch.mjs`'s inline comments do for LBCL's Games 6–10; see the
"Player-identity reconciliation" bullet in `session.md`'s 2026-09-22 entry for the specific
merge decisions made (and the two flagged for a human's judgment, since transcription
confidence wasn't total).

## 6. The vanity slug mechanism

`src/lib/vanity-tournament.ts`:

- `registerVanityTournamentSlug(tx, { organizationId, competitionId, vanitySlug })` — opt-in,
  upserts a `PublicResourceLocator` with `resourceType: "COMPETITION"`. The vanity namespace
  is global (`@@unique([resourceType, publicKey])` across every organization), so registering
  one is a deliberate per-competition decision, never automatic — a common word could
  otherwise be land-grabbed by whichever organization happens to create a competition first.
- `resolveVanityCompetitionId(vanitySlug)` — resolves a slug to `{ organizationId,
  competitionId }` for the public `/[vanitySlug]` route, re-checking the competition is still
  active before trusting the locator.

`src/app/[vanitySlug]/{layout,page,fixtures/page}.tsx` is a **top-level catch-all** route.
Next.js's static-route precedence (a literal path segment always beats a dynamic one at the
same level) is what keeps every existing top-level route (`/login`, `/dashboard`, `/t`, …)
safe from being swallowed by this catch-all — there is no middleware involved, and this
project has none (`AGENTS.md` flags Next 16.2.9 as having breaking changes from training-data
assumptions; middleware may not even exist in the same form in this version).

## 7. Onboarding another tournament

1. Transcribe the box scores into a batch JSON (or write a builder script like
   `build-lbcl-batch.mjs` if there are many games).
2. Run `scripts/data/verify-batch.mjs`-style checksums against your own batch before
   touching a database.
3. `npx tsx scripts/external-stats-ingest.ts <batch.json>` (dry run) against staging first.
4. Take a verified `pg_dump` backup of staging (this project's standing doctrine for any
   staging mutation).
5. `npx tsx scripts/external-stats-ingest.ts <batch.json> --apply`.
6. If any game fails on a `Player(seasonClubId, jerseyNumber)` unique-constraint error,
   see Section 5 — reconcile names/jerseys against the already-created roster and re-run
   (already-imported games report `BLOCKED`/already-FINAL harmlessly, not a double-import).
7. Smoke-test `/[vanitySlug]` and `/[vanitySlug]/fixtures` and the homepage on staging —
   check the **standings table specifically**, not just that fixtures list (see Section 8).
8. Get explicit sign-off before deploying to production — this pipeline creates a new,
   permanent organization and its games; production is outward-facing.

## 8. Standings will read as all-zero unless you check this

`recalculateStandings()` (called after every successful import) filters fixtures through
`competitiveFixtureScope()` (`src/lib/competitive-scope.ts`), an allow-list of
`Fixture.recordOrigin` values that count toward standings/leaderboards/records. As of
2026-09-22 this allow-list is `["PRODUCTION", "IMPORT"]`, so a fresh ingestion's fixtures
(created with `recordOrigin: "IMPORT"`) already count — but if a future `RecordOrigin` value
is ever used for a new ingestion path, it must be added to that allow-list explicitly, or
every fixture using it will import successfully, look completely normal on the fixtures
list, and silently produce an all-zero standings table with no error anywhere. There is no
warning for this - the only symptom is a standings table that never moves. Verify the
standings table shows real numbers after your first ingestion of a new organization, not
just that the fixture list and box scores render.

If eligibility rules change (or a bug like the above is fixed) **after** fixtures are
already imported and `FINAL`, the fix does not retroactively touch already-written
`Standing` rows — `recalculateStandings()` only runs as a side effect of a fresh import, so
run `npx tsx scripts/recompute-standings.ts <organizationId>` once after any such change.

Note the same allow-list is deliberately **not** shared with `presentation-scope.ts`
(broadcast/live visibility) — an imported historical game is competitive (must count for
standings) but was never live-produced through Neon Ultra's own broadcast pipeline, so it
must stay off `/live`, `/broadcast/stats`, and broadcast graphics. Don't "fix" this by
re-merging the two scopes.

## 9. A league's own points formula may not be the platform default

Basketball's platform default is 3 points for a win, 0 for a loss
(`src/lib/sports/basketball.ts`). A real community league may use a different, equally
legitimate convention (LBCL's own published standings use 2-for-a-win/1-for-a-loss). This is
a per-organization decision, not something to silently normalize to the platform default or
silently override without asking — confirm with whoever supplied the source data before
changing it. Once confirmed, it's `SportDefinitionOverride.config.standingsPoints` (only
valid for a `WIN_DRAW_LOSS` standings model), set via
`npx tsx scripts/set-standings-points-override.ts <organizationId> <sportSlug> <win> <loss> [draw]`,
then re-run `scripts/recompute-standings.ts` to apply it to already-imported games.
