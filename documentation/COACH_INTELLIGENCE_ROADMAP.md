---
title: Coach Intelligence Program Roadmap
status: Active
version: coach-intel-1.0
last_updated: 2026-10-18
---

# Coach Intelligence Program (OCR · Coaching Assistant · Vision)

> **Recorded 2026-10-18** from the user's brief, unchanged in substance. Two things were added:
> §2.3 (a re-verification addendum — several "verified" figures in §2.2 were stale or wrong when
> re-checked against staging, and the corrections change I2's design), and §8 (a status log for
> whoever works the phases next). Anything a successor should not have to rediscover is in §2.3.

## 1. Purpose

Three workstreams that turn UltraLeagueOS from a competition recorder into a
coaching tool and a data moat:

1. **OCR Scoresheet Ingestion** — ingest historical paper/PDF scoresheets at scale,
   so a newly-onboarded league arrives with a populated history instead of an empty
   profile. Feeds player/team profiles, opponent scouting, and career records.
2. **Coaching Assistant (completion + extension)** — turn the existing development
   plans and game plans into an operational loop: adopt a plan → assign training →
   log completion → track progress → advise selection/rotation for the next match.
3. **AI Vision** — capture match play (unblock the existing G.21/G.22 foundation on
   real video) and, new, capture training sessions (drills, reps, load).

These are sequenced so each one makes the next one more valuable: OCR fills the
history the assistant reasons over; the assistant gives coaches a reason to log
training; vision automates the logging. Together they produce the **longitudinal
athlete profile** ("Ultra Passport") that the Genius Sports comparison positions as
the differentiated asset.

## 2. Current state (verified, not remembered)

### 2.1 Existing foundations

- **P13 Offline Scoring**: A1–A4 and A3a/A3b largely done. A5 (live-console offline
  integration) is at Step 4 of 8. Not the focus of this program but must be finished
  before Season One (2026-11-14) if the offline hedge is still wanted.
- **P15 Coaching Assistant**: C0 (ADR-011, access, feature flag), C1 (development
  plans engine, 28 drills, 41 unit tests), C2 (opponent game plan engine, defensive
  assignments, late-game plan, review), C3 (Coach Hub at `/coaching` — hub, club,
  squad, setup, player plans, opponent plans, review) — all shipped to staging
  (`COACHING_ASSISTANT_ENABLED=true` on staging only). Production flag stays off.
- **Vision G.21/G.22**: schema (`GameVideo`, `VideoTimelineAnchor`, `CourtCalibration`,
  `VisionModel`, `VisionAnalysisRun`, `VisionTrack`, `VisionObservation`,
  `VisionEventMatch`, `VisionSpatialSummary`, `CourtSpecification`,
  `VisionTrajectoryArtifact`), pure measurement functions, a review UI, an offline
  POC entry point, and a hard capability-separation test. Every empirical claim is
  `BLOCKED_NO_REAL_VIDEO` — no real inference has ever run.
- **External stats ingestion**: `external-stats-ingestion.ts`, `scripts/external-stats-ingest.ts`,
  `game-result-import.ts`. Takes a **hand-transcribed JSON batch**. LBCL (32 games)
  is the reference. The JSON builder and verification scripts are the pattern to
  preserve.
- **Training schema**: `TrainingSession`, `AthleteTrainingRecord`,
  `TrainingMetricDefinition` (platform-global), `AthleteTrainingMetric` exist.
  `TrainingMetricDefinition` has **no organizationId** and **no RLS** — deliberate,
  platform-global like `Sport`.

### 2.2 Known prerequisites / blockers (do not paper over)

- **P0**: production DB is missing `20260928120000_gameevent_resolution_provenance`.
  Any `GameEvent` read/write fails P2022. Fix before anything else touches game data.
- **`Player.position` is literally the string `"Unknown"` for all 181 players**, and
  `heightCm` is 0 for all. The coaching engine falls back to whole-league baselines
  and defender position-matching is inert. C3 added a squad-setup page; it has not
  been used. Filling positions/heights for LBCL is a data task, not a code task, and
  it materially improves I2's output quality.
- **`SystemSetting.key` is a bare global `@unique`** (Stage 5.4A-deferred). The
  coaching assistant does not use `SystemSetting` today, but anything that does
  (plan-adoption persistence if you choose `SystemSetting`, broadcast state) must use
  the org-qualified key pattern from `broadcast-presentation-state.ts`.
- **No real Ultra game video exists.** The user has confirmed none is available yet.
  I4 and I5 are gated on a first real video arriving; they cannot be "finished" before
  then, only made ready.
- **R1/R2 registration, GIESM, LBCL, coaching, and tenancy work all coexist**. Do not
  fork; the Multi-Sport Architecture's D1–D3 decisions and the tenancy doctrine
  (server-derived org, RLS, composite FKs, canonical-write ratchet) apply to every
  new model below.

### 2.3 Re-verification addendum (2026-10-18, read-only against staging)

Re-checked before starting any phase. Where the brief's figures and the database disagree, the
database wins; the design consequences are noted because two of them change I2.

| Claim in §2.1/§2.2 | Re-verified 2026-10-18 | Consequence |
|---|---|---|
| "A5 is at Step 4 of 8" | **Stale.** Steps 1-8 are implemented and committed (`745eb7b`, `4190cfd`, `2324247`, `9098ed7`, 2026-10-17/18), verified by a 37-test DB suite and a live-vs-replay parity test. Pending: a logged-in browser rehearsal with a real network drop, and the flag (off everywhere). | The offline hedge is no longer the program's blocker; only rehearsal + rollout remain. |
| "`Player.position` is `Unknown` for all 181 players" | **Wrong in both number and scope.** Staging has **400** players; **158** are `Unknown` (and exactly those 158 also have `heightCm` null/0). **242 have a real position. `CPS` (Campos) is 23/23 fully usable; Ultra's eight Season Zero clubs are all fully usable** (APEX 8/8, SURGE 8/8, VORTEX 8/8, FLUX 8/8, EMBER 7/7, HALO 9/9, ECLIPSE 8/8, NOVA 9/9 — position **and** height). The nine other LBCL clubs (LAR, LBS, WHF, OGR, LFK, SSH, STM, UTA, CTB) are 0/N. | **I2's data guard must be per-squad, not league-wide.** The Selection Advisor is usable today for Ultra fixtures and CPS; it should return `INSUFFICIENT_DATA` only for squads that genuinely lack positions/heights. The data task is narrower than stated: ~178 LBCL players across nine clubs, and it must fill **height as well as position** (a player with a position but no height is still unusable for matchup scoring). |
| Training tables "exist" | Confirmed present, but **all four are empty**: `TrainingMetricDefinition` 0, `TrainingSession` 0, `AthleteTrainingRecord` 0, `AthleteTrainingMetric` 0. | I3 is not "confirm which definitions already exist" — nothing does. Every target key in I3 needs a seed migration, including the C1 target keys. |
| `CoachingPlan` table | Confirmed **absent**. | I2's C1 remainder is a greenfield table, not an edit. |
| `SystemSetting.key` is a bare global `@unique` | Confirmed: 20 rows, 20 distinct keys, no org qualifier in the key itself. | Unchanged advice: use the org-qualified-key pattern from `broadcast-presentation-state.ts` for anything new. |
| Staging migration state | `20260928120000_gameevent_resolution_provenance` applied; `GameEvent.resolvedBy` present. | Staging is sound; only production carries the P0 gap. |

**On the brief's closing instruction** ("mark P15 C1/C2/C3 as complete — extensions tracked here"):
C2 and C3 are already `Done` in `documentation/PRODUCT_ROADMAP.md`; C3 keeps its "manual 390px visual
check still to do" caveat. **C1 is deliberately NOT marked complete**: the brief's own I2 lists the
`CoachingPlan` table and the adopt action as deliverables, and the table does not exist. C1's row now
reads "engine complete; `CoachingPlan` + adopt tracked as I2" — marking it complete and then building
it in I2 would be the kind of bookkeeping that makes a roadmap lie.

## 3. Phase plan

Phases are ordered by dependency and value. **I1 and I2 can run in parallel**; I3
depends on I2; I4 and I5 are gated on real video.

| ID | Phase | Depends on | Est. | Value |
|---|---|---|---|---|
| I0 | P0 production migration fix | — | 1 day | Unblocks all game-data work |
| I1 | OCR scoresheet ingestion v1 (basketball) | I0 | 4–6 wk | Onboard leagues with history |
| I2 | Coaching assistant completion + Selection Advisor | I0 | 3–4 wk | Coach-facing stickiness |
| I3 | Training execution loop (plan → session → progress) | I2 | 3–4 wk | Closes the training ask |
| I4 | Vision match capture unblock | Real video | 8–12 wk | Automated stats + highlight data |
| I5 | Vision training capture (drills, load) | I4 | 8–10 wk | Automated training logging |
| I6 | Unified athlete passport | I1–I5 | 4–6 wk | The Genius-doc end goal |

**Status after the 2026-10-18 long-run streaks** (v3 + v4; detail in `session.md`):

| ID | Status |
|---|---|
| I0 | **Done, in production** — migration applied after a verified backup, verified, 5-minute log watch clean; `deploy.sh` halts on pending migrations (and correctly continues when `--migrate` is passed, re-checking after migrating). A second production deploy on 2026-10-18 applied the six coaching/scoresheet migrations behind another verified backup. |
| I1 | **Pivoted to CSV/Excel; OCR blocked.** The image path is measured and NOT operator-ready: 12/20 real sheets produce a table, 8/20 produce player rows, 0 are review-ready, and grid detection is *refused* on those screenshots at 720px and 3000px (they are Instagram captures whose cell grid does not survive). The structured path is the product: **CSV and XLSX both round-trip 32/32 real LBCL games with zero field differences**, drive import → review → approve → ingest (a real game ingested on a scratch DB: 24 stat lines, 79 points), and the checksums found and fixed **4 genuine arithmetic errors** in the hand-transcribed batch (corrected in the JSON and in the already-ingested `PlayerStat` rows in staging *and* production, audited). XLSX shares the CSV parser, so there is one table-detection implementation. OCR is dormant until a real scan or the provider's PDF export exists. Detail: `OCR_SCORESHEET_INGESTION.md`. |
| I2 | **Done for review** — `CoachingPlan` + adopt + Selection Advisor shipped; awaiting the user's sign-off on the advisor against real fixtures. |
| I3 | **Done, in production** — assign → complete → log metric, the deferred `AthleteTrainingRecord.developmentFocus` stamp, and the trend card (per-session logs vs the plan's game window, "Missing data" for an unlogged session, verdict withheld when a metric's direction is unknown). 6 component tests + 6 unit tests. |
| I4 | **`BLOCKED_NO_REAL_VIDEO` for inference; ingestion infrastructure PROVEN.** `scripts/vision-ingest.ts` is one command: ffprobe → media storage → `MediaAsset`/`GameVideo` → worker `POST /analyze`; verified on staging with a real 5-second ffmpeg clip (rows, file, audit, idempotent re-run). The review workflow was proven separately with synthetic observations (Confirm/Reject, statuses, audit). No inference has been run and no accuracy is claimed. Runbook: `documentation/vision/VISION_INGESTION.md`. |
| I5 | **Gated** on I4 (real footage). |
| I6 | **Done v1, in production** — passport read model with per-row provenance (LIVE / LIVE STAT / OCR REVIEWED / IMPORTED / MANUAL / UNKNOWN), coach-only training + plans, a provenance legend with hover explanations, a "View passport" link from the public athlete page with an organization-correct read, and an **explicit `passportPublished` flag** (migration `20261018190000`) with a checkbox on the athlete edit page: unpublished → 404 for everyone who is not a coach/operator, link hidden on the public page, verified both ways on staging. |

**Production note:** the coaching stack (I2/I3/I6) is deployed and verified in production
(`release-4793f7f`, then `release-06b8282`+ with the publication flag), with
`COACHING_ASSISTANT_ENABLED=true` in `/opt/ultraleagueos/shared/web.env` and `/coaching` returning 200 to an
admin session. Every deploy runs the smoke test (`deploy/ops/smoke-test.sh`) and fails the deploy if a
representative route does not serve. The working branch `ops/reconcile-backup-design` is **fast-forwarded
into `main`** (main was an ancestor: 0 commits behind, 51 ahead on the branch), so production runs the
default branch.

**Streak v6 note (2026-10-18): the coaching stack gained a partner data feed, not a coach feature.** The
`DataFeedSubscription`/`DataFeedDelivery` outbox, the HMAC-signed webhook dispatcher, the
`/api/v1/games/[fixtureId]/live-feed` endpoint and the 30-second systemd drain timer are all live in
production. Two bugs found while hardening it are worth recording against this roadmap because they are the
class of bug the coaching work would inherit if it ever writes a tenant table:
1. the feed tables were granted to `ultraos` while the app runs as `ultraos_staging` / `ultraos_app` - a
   42501 that a green test suite could not see, fixed by `20261018202000_data_feed_grants`;
2. the RLS policies read `app.current_organization_id` while `withOrganizationContext` sets
   `app.current_org_id` - under the app role the tables were invisible, fixed by `20261018203000`.
`deploy/ops/verify-tenant-table.sh` now checks both (grants against a known tenant table, and a behavioural
scoped-SELECT/cross-tenant probe **as the app role**) and is the first thing to run against any new tenant
table. The coaching tables were re-checked with it: they pass.

### I0 — P0 production migration fix (blocking, do first)

See Prompt 0. Additive migration, verified backup, human-approved.

> **Status 2026-10-18: BLOCKED on a human yes.** Approval prompts are disabled in this session, and a
> production schema change without an explicit instruction is not something to attempt and have
> auto-rejected. The procedure and the evidence are in
> `documentation/architecture/HANDOVER_P13_OFFLINE_SCORING_2026-10-17.md` §0; it is one additive
> `prisma migrate deploy` after a verified `pg_dump`.

### I1 — OCR scoresheet ingestion v1

**Goal**: photograph or PDF of a basketball box score → reviewed structured data →
existing `ingestBoxScoreGame` pipeline. The manual transcription step in
`EXTERNAL_STATS_INGESTION.md` §3 is what OCR replaces; everything downstream is
preserved.

**Deliverables**:
- `ScoresheetImage` upload flow (operator-facing), stored via `MediaAsset`
  (`MediaAssetPurpose.SCORESHEET_IMAGE`, additive enum value).
- OCR extraction service. **Tesseract-first** (no vendor lock-in; runs offline on the
  shared host); a pluggable `OcrProvider` interface so a cloud provider can be added
  later without touching the pipeline.
- Table-structure detection for the two known sheet layouts (LBCL template and FIBA
  box score). Sheet templates are data, not code — a JSON `ScoresheetTemplate`
  declaring column order, header row, totals row, DNP marker.
- Field-level confidence scores; a **human review queue** at `/scoresheets/review`
  showing the source image alongside extracted fields, per-cell editing, and
  approve/reject. Nothing enters the canonical pipeline without review approval.
- Extraction output is a `IngestBoxScoreInput` batch JSON — the *same* artifact a
  human transcribes today. Reuse `verify-batch.mjs`-style checksums as an automatic
  gate before a batch can be applied.
- Review audit log (who approved, when, source image hash, extraction version).
- Multi-sport: v1 is basketball only. Volleyball/table-tennis/football templates are
  follow-on templates, not new code paths.

**Non-goals**: live scoring, replacing the live consoles, auto-approval without
human review, handwriting recognition as a v1 acceptance bar (printed sheets first;
handwriting is a stretch goal flagged per-sheet).

**Exit criteria**: 20 real historical LBCL sheets run end-to-end, every cell
independently verified against the sheet's printed totals by the existing checksum
discipline, ≤5 minutes of human review per game, zero silent mis-transcriptions.

### I2 — Coaching assistant completion + Player Selection Advisor

**Status 2026-10-18: complete for review.** The C1 remainder (`CoachingPlan` + adopt) and the Selection Advisor
(engine + page) are shipped to staging. What is NOT done: the user's sign-off on the advisor against real fixtures
(the 4-fixture sanity check in `documentation/COACH_SELECTION_ADVISOR.md` is evidence, not sign-off), and the flag is
still off in production. Detail in `session.md` (2026-10-18) and §8 below.

One deliberate deviation from the deliverables below: the adopt action does **not** write
`AthleteTrainingRecord.developmentFocus`. That column is per training session
(`@@unique([trainingSessionId, athleteId])`), and no session exists at adoption time, so writing one would mean
fabricating a session. The durable record is `CoachingPlan`; `developmentFocus` is stamped when I3 assigns a plan to
sessions.

**Goal**: close the C1 remainder, then add the "which player to use next time" ask.

**Deliverables**:
- **C1 remainder**: `CoachingPlan` table (org-scoped, RLS, composite FK to
  `SeasonClub` and `Player`), the "Adopt plan" action that writes
  `AthleteTrainingRecord.developmentFocus`, and seeded `TrainingMetricDefinition`
  rows for the plan's target keys.
- **Player Selection / Rotation Advisor** (new): given a fixture and the available
  squad, produce a ranked rotation recommendation:
  - form score (rolling 5-game, minute-adjusted),
  - matchup score (from C2's opponent profile + player position/height once
    populated),
  - availability (fouls per 36, minutes load, recent game count),
  - explicit `Evidence` on every recommendation (same contract as C1/C2),
  - a "why not the alternative" note for the next-ranked player.
  Pure function in `src/lib/coaching/selection.ts`, unit-tested like
  `game-plan.ts`; surfaced on the opponent plan page and a new
  `/coaching/selection/[fixtureId]`.
- Position/height data-quality guard: when the squad's usable position count is
  below a threshold, the advisor returns `INSUFFICIENT_DATA` with a link to the C3
  setup page rather than guessing from league-wide baselines.
- Flag stays `COACHING_ASSISTANT_ENABLED` (staging on, production off) until the
  user signs off on the new advisor against real fixtures.

**Exit criteria**: 3 real upcoming/historical fixtures where the advisor's top 5
matches what the coach actually played (or the divergence is explainable and
recorded); all new code unit-tested; no canonical write except the deliberate
adopt action, which goes through the existing canonical-write ratchet.

### I3 — Training execution loop

**Goal**: the plan is not a PDF; it is a queue of sessions with completion and
progress.

**Deliverables**:
- Assign an adopted plan's focus area + drill block to one or more `TrainingSession`
  rows (schema exists; verify against `TrainingSession`/`AthleteTrainingRecord`).
- Coach marks a session complete, logs the plan's `Target` metric (manually in v1;
  vision-driven in I5), and the player plan page shows a trend line of the metric
  across the 6-game target window.
- `TrainingMetricDefinition` seeds for the C1 target keys (`FT_PCT`, `TS_PCT`,
  `TOV_RATE`, `OREB_RATE`, `STL_RATE`, `BLK_RATE`, …) — confirm which already exist
  before adding.
- RLS + composite-FK tenancy on any new table, following Stage 5.4B.
- Coach Hub tab "Training" with the week's assigned sessions and overdue flags.

**Exit criteria**: a full cycle run on LBCL — adopt a plan, assign 2 sessions, log
completion, see the target move on the player page.

### I4 — Vision match capture unblock

**Goal**: turn the G.21/G.22 foundation from "architecturally proven, empirically
blocked" into a running pipeline on real video.

**Entry gate**: at least one real Ultra (or consented pilot) game video with known
ground truth (a scored game) delivered to the host.

**Deliverables**:
- Standalone Python inference service per `P13_P14_RECONCILIATION.md`'s signed-off
  stack: Python 3.12, PyTorch 2.x, RF-DETR-Small (baseline) / YOLOv11-M (fallback),
  ByteTrack, Tesseract→CNN jersey OCR, ONNX Runtime, FastAPI + Celery + Redis,
  Docker Compose. **B0 skeleton already exists** at `services/vision/` — resume, do
  not rebuild.
- Real inference worker; `VisionAnalysisRun` lifecycle against real video; human
  review queue at `/vision/games/[fixtureId]`.
- **The hard boundary from `AI_VISION_ARCHITECTURE.md` remains**: vision is
  review-only and never writes `GameEvent`/`PlayerStat`/`TeamStat`/`Fixture` scores.
  Promotion to canonical is a human action through the existing statistician flow.
  `capability-separation.test.ts` must stay green.
- Empirical accuracy report against the ground-truth game (precision/recall of
  detected events vs. canonical events, with the existing `vision-evaluation.ts`),
  published honestly including failures.

**Exit criteria**: one real game fully processed, reviewed, and evaluated; the
evaluation report states the real precision/recall numbers rather than claiming
accuracy.

### I5 — Vision training capture

**Goal**: the same camera that watches games watches drills and logs load.

**Entry gate**: I4 accepted.

**Deliverables**:
- Additive schema: `TrainingVideo` (or `GameVideo` with a new `purpose` — decide
  explicitly, do not silently overload), drill/rep events, workload metrics
  (`jump_count`, `sprint_count`, `distance_covered`, `session_duration`), and an
  `AthleteWorkloadDaily` projection.
- Drill recognition for a small, named set of basketball drills (form shooting,
  closeouts, defensive slides, free throws) — declared in data, not code, matching
  the sport-definition doctrine.
- Link each drill result to the adopted plan's focus area so a player's progress is
  evidenced by vision, not only by a coach's tick.
- Load flags: acute:chronic workload ratio warning surfaced to the coach when a
  player's recent load is out of band. Advisory only.
- Same review queue and capability boundary as I4; the canonical-write ratchet
  unchanged.

**Exit criteria**: one training session recorded with a consented player, drills
recognised, metrics produced, coach-reviewed, and tied to the plan.

### I6 — Unified athlete passport

**Goal**: the Genius comparison's "Ultra Passport" — a longitudinal athlete record
combining OCR-ingested history, live stats, training, and vision-derived metrics.

**Deliverables**:
- Read-model assembly across `Athlete`, `Player` (season), `PlayerStat`/
  `GameMetricValue`, OCR-ingested historical games, `AthleteTrainingRecord`,
  vision-verified observations.
- Public-safe profile (public pages) and coach-scoped profile (evidence +
  recommendations).
- Career timeline: clubs, seasons, games, plans, milestones.
- Explicit "data provenance" badge on every metric: live, OCR (reviewed), vision
  (verified), manual.

**Exit criteria**: one real LBCL player with OCR-ingested history displays a complete
career view with provenance badges.

## 4. Mapping to the Genius Sports end goal

The `Genius Sports vs UltraLeague OS` documents describe the business model: **free
software for rights, monetise the data**. Each phase here contributes a specific
asset:

| Phase | Business contribution |
|---|---|
| I1 OCR | A newly-onboarded league arrives with history — a populated data moat from day one, not an empty profile. Directly enables the "second league in 90 days" action item. |
| I2 Coaching | Retention and daily-use stickiness for organizers. The reason a coach opens the app on a non-matchday. |
| I3 Training | Structured training data — richer and cheaper than Genius's per-game scout model, because the organizer's own staff produce it as a workflow byproduct (Strategy 3 in the comparison). |
| I4 Vision | The clear differentiator: "Dragon for everyone else" — single-camera, no stadium infrastructure. Premium tier / higher-quality data feed. |
| I5 Vision training | Load management data no competitor at this tier captures; opens performance-consulting and injury-prevention value. |
| I6 Passport | The longitudinal athlete record Genius's elite-only model never builds. The "genuine first" in the module comparison table. |

## 5. Cross-cutting rules (non-negotiable, from the project's own doctrine)

- **Tenancy**: every new tenant table carries `organizationId`, RLS (enabled + forced),
  a `tenant_isolation` policy, and composite FKs where the relation is required/non-
  nullable. Follow `PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md`.
- **Canonical write**: anything that writes `GameEvent`/`PlayerStat`/`TeamStat` goes
  through `src/server/scoring/**`. `npm run lint:canonical-writes` must stay green
  (4/4 today). Vision and OCR do **not** write these; they produce reviewed inputs.
- **Feature flags**: `COACHING_ASSISTANT_ENABLED` and any new flags default off in
  production; on in staging during development.
- **Migration discipline**: additive first, hand-authored where `prisma migrate diff`
  is unreliable, verified backup before any staging mutation, staging proof before
  production, human approval before production.
- **Honesty**: a phase marked `BLOCKED_NO_REAL_VIDEO` or `NOT_RUN` is not a pass.
  "Proven" means empirically proven against real data, in the project's existing
  sense.
- **Process fix** (from the P13 handover): run `prisma migrate status` as a deploy
  step so a future "code shipped without its migration" cannot recur.

## 6. Risk register

| Risk | Mitigation |
|---|---|
| OCR accuracy on poor phone photos | Human review is mandatory; confidence thresholds; per-template validation; checksums before apply. |
| Handwriting recognition scope creep | Declared non-goal for v1. Printed sheets first. |
| Coaching assistant quality with no positions/heights | Data task surfaced, not silently papered over; `INSUFFICIENT_DATA` instead of guesses. Now scoped per squad (§2.3), since Ultra's clubs and CPS already have the data. |
| Vision accuracy overclaim | Hard capability boundary + honest evaluation reports. |
| Training capture on video = new schema | Explicit decision on `TrainingVideo` vs `GameVideo.purpose` before writing it; additive either way. |
| Production schema drift (the P0 that happened) | P0 fix + deploy-step `migrate status` check. |
| Shared VPS load / build OOM | `NODE_OPTIONS=--max-old-space-size=4096` from the first attempt; never `cp -al` a release. |
| Parallel sessions sharing the tree | `git status` before commit; stage explicit paths; never touch unrelated untracked folders. |

## 7. Immediate next actions

1. **I0 / Prompt 0**: apply the pending production migration (approval required).
2. **I1 / Prompt 1** and **I2 / Prompt 2** in parallel — they touch disjoint code.
3. Get the LBCL position/height data filled (operator task) before I2 acceptance.
4. Source a first real game video for I4; until then I4/I5 are `GATED_ON_VIDEO`.

Update `documentation/PRODUCT_ROADMAP.md` to link here and mark P15 C1/C2/C3 as
"complete — extensions tracked in COACH_INTELLIGENCE_ROADMAP.md".

## 8. Status log

Append one line per working session. Do not rewrite history here; correct it in §2.3 and note the
correction.

| Date | Phase | What happened |
|---|---|---|
| 2026-10-18 | — | Roadmap recorded; §2.2 claims re-verified against staging (§2.3). I0 blocked on a human yes (approvals disabled). No phase started. |
| 2026-10-18 | I2 (slice 1) | `CoachingPlan` + adopt action shipped: schema (composite tenant FKs, RLS), migration `20261018120000_coaching_plan_adoption` with the hand-authored partial unique index and 9 `TrainingMetricDefinition` seeds, `plan-snapshot.ts`, `server/coaching/plans.ts`, adoption panel on the player page. Migrated on **staging** (backup `ultraos_staging_pre_coaching_plan_20261018T004821Z.dump`), post-apply `migrate diff` shows no structural drift. 6/6 DB tests, 899 pure, ratchet 4/4, build clean. Production untouched. Next: Selection Advisor + per-squad `INSUFFICIENT_DATA` guard. |
| 2026-10-18 | I2 (slice 1, gate) | Deployed to staging (`release-10a0b2f`). The entry gate found a **real 500**: `permission denied for table CoachingPlan` - the new table had no runtime-role grants (no `ALTER DEFAULT PRIVILEGES` in this DB). Fixed by `20261018130000_coaching_plan_grants`; RLS unchanged. Rendered all coaching pages with a real SUPER_ADMIN session over authenticated HTTP (no browser available): both adoption states OK, and a real end-to-end adoption through the no-JS `useActionState` path wrote an ACTIVE plan + audit row. |
| 2026-10-18 | I2-b (deliverable 1) | Pure `src/lib/coaching/selection.ts` + 13 unit tests + `scripts/coaching-selection-preview.ts`. Form reuses C1 over a 5-game window, matchup reuses C2's assignments and degrades OK/DEGRADED/INSUFFICIENT_DATA with renormalized overall, availability = fouls/36, load = games/14 days. Real-data run: CPS `OK` with `DEGRADED` matchup (opponent positions missing), Ultra Apex `INSUFFICIENT_DATA` (3 games vs C1's 4-game gate). Weights/thresholds were not in the prompt and are documented decisions in the file. **Not built: the selection page** and the 3-fixture exit-criterion comparison. |
| 2026-10-18 | I2-b (deliverables 2+3) | `/coaching/selection/[fixtureId]` shipped and deployed to staging (`release-9cfb2de`): guarded by `requireCoachingViewer` → fixture resolution → `requireCoachingClub`, linked from the opponent plan page, 404 for anonymous (curl-verified). The view shows no START/ROTATE/BENCH labels when the advice is `INSUFFICIENT_DATA` (component test + deployed curl both check it), shows "no form sample" instead of an overall for under-sampled players, and names the missing fields with a setup link when matchup is degraded. Real-data sanity check in `documentation/COACH_SELECTION_ADVISOR.md`: 3 LBCL + 1 Ultra fixture, rebuilt as-of kickoff with the fixture excluded — 4/5, 4/5, 4/5 overlap with actual top-5 minutes; every divergence explained by data the advisor lacks (DNP, 37-minute bench game, 12-man rotation). No tuning; three real fixes came out of it (never-played load, form-sample renormalization, sample-first ranking). Also recorded: a bare `--ref <branch>` deploys a stale local checkout (deploy/README.md). |
