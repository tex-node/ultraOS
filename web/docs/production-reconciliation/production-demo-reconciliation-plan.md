# Production Demo Reconciliation Plan (Track G.2 — Preview Only, Not Executed)

Reconfirmed this session (2026-08-09): production still has 8 Clubs, 8 SeasonClubs, 1 Draft, 1 DraftPick, 8 `Player.seasonClubId` assignments, 6 Fixtures, 8 Standings — all from the same June 15 demo/seed batch (`cmqfqpn...` cuid prefix). Nothing in this set was touched by Track G.2's Application-status writes. See [club-transformation-manifest.md](club-transformation-manifest.md) for the per-club dependency table.

## Recommended sequence (not executed — requires separate authorization after migrations deploy)

1. **Detach confirmed-demo Player assignments.** Null out `Player.seasonClubId` for the 8 demo players (all `*.athletes.neonultra.ng`). Preserves the Player/User/Athlete rows themselves — only removes the club link, per the hard rule against deleting Users/Athletes/Players.
2. **Archive the demo Draft/DraftPick.** Do not delete — either add an `archived`/`isDemo` flag if one exists post-migration, or leave the single COMPLETED Draft in place and simply never reference it from the real Season Zero DraftEvent. The real Season Zero draft uses its own `DraftEvent`/`Draft` records (already supported by the `draftEventId` relation added in Track F), so the demo Draft does not need to be deleted to avoid collision.
3. **Reconcile demo Fixtures/Standings.** The 6 Fixtures and 8 Standings reference the demo SeasonClubs under Men's Division. Once step 1 clears the player linkage, these can be reset to zero (Standings) or archived (Fixtures) without touching any real participant data.
4. **Correct SeasonClub divisions.** Reassign EMBER/HALO/ECLIPSE/NOVA's SeasonClub from Men's to Women's — safe only after step 3, since Standing rows are keyed to `(seasonClubId, divisionId)` in downstream queries.
5. **Rename/rebrand Clubs.** APX→APEX, SRG→SURGE, VTX→VORTEX, FLX→FLUX, EMB→EMBER, HLO→HALO, ECL→ECLIPSE, NVA→NOVA — name/shortName only, independent of steps 1-4, safe to do any time post-migration.
6. **Attach authoritative logos.** Source files already verified at `C:\UltraLeagueOS\assets\clubs` (checksums match staging's ingested MediaAssets). Requires the `MediaAsset` table, which doesn't exist in production yet.
7. **Create clean Season Zero standings/state.** Once steps 1-4 are done, initialize fresh zero-value Standing rows for the real Season Zero season under the corrected divisions.

## Why this wasn't executed this session

Track G.2's explicit mission was the player identity/status gate only. Steps 1-7 above touch Club/SeasonClub/Fixture/Standing/DraftPick data outside that scope, and several require schema not yet deployed to production (`MediaAsset`, branding fields, possible `archived` flags). This plan is preview-only per Stage 13's instruction ("Do not execute this sequence yet").
