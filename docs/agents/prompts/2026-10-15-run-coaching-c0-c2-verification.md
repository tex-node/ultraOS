# Claude Code prompt: verify, real-data check, and commit Coaching Assistant C0-C2

Paste everything below the line into Claude Code, opened in C:\UltraLeagueOS.

---

You are working in C:\UltraLeagueOS (repo tex-node/ultraOS). Read AGENTS.md first, then the two
newest entries at the end of session.md ("P15 Coaching Assistant: C0 ... C1 engine" and
"P15 C2: Opponent Game Plan Engine"), then docs/adr/ADR-011-Coaching-Assistant.md.

## Context

The Coaching Assistant phases C0, C1 (engine) and C2 were written in a remote session that could
only run the new unit tests and a type check scoped to the new files. Full-project checks and
real-data checks have NOT been run. Nothing is committed yet. Your job: verify, check against
real data, fix what's wrong, commit. Don't build new features in this task.

New/changed files (all uncommitted):
- docs/adr/ADR-011-Coaching-Assistant.md, docs/adr/INDEX.md (line added), GLOSSARY.md (new, root)
- web/src/lib/coaching/: config.ts, positions.ts, drills.ts, access.ts, feature-flag.ts,
  player-development.ts, game-plan.ts + 4 *.test.ts files
- web/scripts/coaching-development-preview.ts, web/scripts/coaching-game-plan-preview.ts
- documentation/PRODUCT_ROADMAP.md (P15 rows), session.md (two entries)
- docs/agents/prompts/*.md

Leave these pre-existing changes alone; they are not part of this work: web/postcss.config.mjs,
and the untracked UI/, Draft UX/, assets/, data/, docs/academy, docs/architecture etc.

## Rules

- Read-only against every database. Do not run migrations, seeds or anything with --apply.
- Never touch production. Staging is allowed for read-only preview scripts only.
- Never print or commit secrets from cred/ or .env.
- If a fix would change the meaning of a rule in ADR-011 or a threshold in
  src/lib/coaching/config.ts, propose it and wait for my OK. Bug fixes don't need approval.

## Step 1: full checks (in web/)

1. `npm run typecheck`
2. `npm run lint` (if lint complains about the new files, fix them; don't add suppressions)
3. `npm test` (must include the 28 tests under src/lib/coaching; the full suite was 843 passing
   before this work, so report the new total)
4. `npm run lint:canonical-writes` (lib/coaching must not write GameEvent/PlayerStat/TeamStat/Standing)
5. `npm run build`
Fix anything that fails. Report each result.

## Step 2: find the real-data ids

Find the LBCL organization id and its "2026 Season" season id. Look in session.md first (the
LBCL ingestion entries, e.g. "LBCL: Ingest Games" and "LBCL season end date"), then fall back to a
read-only Prisma query. Check whether the local database (web/.env DATABASE_URL, localhost) has
the LBCL games (33 games through 4 Oct 2026). If not, use staging the same way earlier LBCL
sessions ran read-only scripts there (see session.md for the exact procedure and paths). Tell me
which database you used.

## Step 3: run both previews

From web/:
```
npx tsx scripts/coaching-development-preview.ts <orgId> <seasonId> "Ultra Basketball"
npx tsx scripts/coaching-game-plan-preview.ts <orgId> <seasonId> "Ultra Basketball"
```
Save the full output to tmp/coaching-preview-2026-10-15.txt (tmp/ is not committed).

## Step 4: sanity-check against the box scores

For 3 Ultra Basketball players and 3 opponents, cross-check at least 2 numbers each against the
raw PlayerStat/TeamStat rows (or the LBCL box-score images in lbcl/ if needed). Also look for:
- Players whose Player.position doesn't map to GUARD/WING/BIG (shown as "-> UNKNOWN"). List the
  raw strings; extend positions.ts if they are clearly basketball positions.
- Dimensions that are INSUFFICIENT_DATA for almost everyone (e.g. FOUR_POINT, Ultra Time in
  LBCL). Expected; just report which.
- Null-heavy fields: if LBCL box scores lack OREB, bench points or period scores, report which
  keys can never fire for LBCL.
- Anything that reads wrong to a coach: odd wording, a key contradicting the numbers, a defender
  suggestion that makes no sense, a target lower than the current value for a higher-is-better
  stat.
- Threshold behaviour: how many focus areas per player and keys per opponent on average. If
  nearly everyone or nobody gets flagged, propose a config.ts change with numbers (don't apply it).

Write each finding as a test first where possible, then fix.

## Step 5: commit

Small commits, conventional style like the repo history, for example:
1. `docs(coaching): ADR-011 coaching assistant boundary, glossary, agent prompts`
2. `feat(coaching): C0 access rules + COACHING_ASSISTANT_ENABLED flag`
3. `feat(coaching): C1 player development engine, drill registry, preview script`
4. `feat(coaching): C2 opponent game plan engine, post-game review, preview script`
5. any fix commits
6. `docs(session): C0-C2 verification and real-data check`
Before committing, append a dated session.md entry: what you ran, results, real-data findings,
fixes, and any proposed config changes waiting on me. Update the C1/C2 rows in
documentation/PRODUCT_ROADMAP.md. Do not push or deploy; tell me when the commits are ready.

## Report back with

- Step 1 results (pass/fail per command, test totals)
- Which database you used and the ids
- 2 sample development plans and 2 sample game plans, pasted from the preview output
- Findings list, what you fixed, and proposed config changes
- Commit list
