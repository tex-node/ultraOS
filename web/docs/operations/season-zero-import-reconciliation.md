# Season Zero import reconciliation (retrospective)

Season Zero (15 August 2026, NIS Outdoor Court, National Stadium Surulere, Lagos) was played
and scored entirely outside this app - the live scorer console existed but was never used for
the real games. All 11 real competitive results (6 Men's, 5 of 6 Women's) exist only in FIBA/
Genius Sports Box Score PDFs. This document is written **after** that data was already
imported to production (via `scripts/g84-import-season-zero-results.ts`, verified in an earlier
session) - it's a retrospective reconciliation, not a pre-import dry-run plan, because the
import already happened before this canonical-scoring-model work started.

## What was imported

- 11 of 12 real games (the 12th - Ember vs Nova - was never played; `Fixture.status` for it
  correctly remains `SCHEDULED`, not fabricated as a result).
- 1 exhibition (All-Star) game, tracked separately, not part of league standings.
- Final scores, period-by-period scores (`GamePeriodScore`), team totals (`TeamStat`), and
  per-player box score lines (`PlayerStat`) for every matched player.
- Every write went through `previewGameResultImport`/`importGameResult`
  (`src/lib/game-result-import.ts`), which validates the fixture isn't already `FINAL`
  (idempotency), validates the home/away club names match the real fixture
  (`GAME_IDENTITY_MISMATCH` check), and writes an `AuditLog` entry
  (`GAME_RESULT_IMPORTED`) per game.

## Data-quality issues found and how each was handled

All caught by `scripts/g84-import-season-zero-results.ts`'s `validateGame()` pre-flight
arithmetic validator (2PM+3PM=FGM, 2PA+3PA=FGA, 2×2PM+3×3PM+FTM=PTS, team totals reconcile with
the final score) or by manual cross-checking against the source PDFs before any database write:

- **One real transcription error** (Game 6, Apex vs Vortex): a shooting line was accidentally
  copied onto the adjacent player row. Caught by the arithmetic validator before any write;
  fixed by re-reading the source PDF.
- **Duplicate "Game No.: 8"** in two unrelated PDFs' own headers (a source-data quirk, not an
  app bug) - games were keyed by team pairing + date instead of the PDF's internal game number.
- **PDF print order didn't always match the real Fixture's home/away designation** (one game,
  "HAL vs EMB," printed Halo first even though Ember is the real home team) - every game's
  score-to-team assignment was cross-checked against the actual Fixture before transcription,
  not assumed from the PDF's left-right order.
- **FIBA name truncation** (e.g. "ADAGIFT" for "Ada Gift Okechukwu") caused real players to go
  unmatched under exact-name matching. Fixed with a safe unique-prefix-match fallback in
  `matchTeamPlayers()` (safe because each club's roster is small, ~7-9 people, with no
  realistic ambiguity risk).
- **Individual unmatched players never block a whole game's import** - `importGameResult` skips
  just that player's `PlayerStat` row while still importing the real, verified team-level
  result, and reports every skip. A single bad name shouldn't cost the app a real, verified
  team score.

## Known, still-open data gaps (not resolved by this session - require a human decision)

- **Genuinely unrostered real players** who clearly played in a real game but have no `Player`
  record at all: Dennis Godswill, Nouman/Noumane Jirinada, Tik Fagbila, Agbo Joshua, Shittu
  Lanre, Olubodun Daniel, Egbayelo Peter, Oluwatobi Adesanya, Oremiposi Kinde, Okechukwu Gift,
  Johnson Precious, Oshunnubi Iyanuoluwa, and others - left as skipped `PlayerStat` rows, not
  fabricated.
- **3 cross-club discrepancies**: Onitolo Koyinsola Deborah, Iwajoba Rofiat, and Bakare
  Oreoluwa are each recorded in the app under one `SeasonClub`, but the real box scores show
  them consistently (across 2 games each) playing for a *different* club. This needs an
  explicit administrator decision (correct the roster record, or treat the box score as wrong)
  - not something either direction should be silently "fixed" in.

## Known technical gap introduced by this session's schema work

The `statSource` column didn't exist when the 11 games above were imported, so those
production rows currently have `statSource: null` rather than `FIBA_LIVESTATS_PDF_IMPORT`. See
[data-capability-and-provenance.md](../architecture/data-capability-and-provenance.md) for the
one-line backfill this needs. Not applied automatically by this session, since it's a
production data write outside the original scope of "add the column."
