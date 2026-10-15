# Agent Prompts — Coaching Assistant (P15) + AI Vision (P14 B1+)

Written 2026-10-15 from a read of `PROJECT_REPORT.md`, `session.md` (through 2026-10-14),
`documentation/PRODUCT_ROADMAP.md`, `docs/ai vsion.txt`, `web/src/lib/analytics/*`,
`web/src/lib/vision/*`, `services/vision/*` and `web/prisma/schema.prisma`.

## Where things stand

**Coaching side — what already exists (all descriptive, none prescriptive):**
- `lib/analytics/opponent-scouting.ts` — per-opponent report (record, PPG, top-3 scorers, H2H,
  threshold-gated threats/weaknesses, Team DNA tags). Hardcoded to "Ultra Basketball", gated to
  one email via `lib/insights-access.ts`, shown at `/[vanitySlug]/insights` (LBCL).
- `player-dna.ts`, `player-statistical-identity.ts` (`playerDevelopingAreas`),
  `player-development-context.ts` — explicitly says *"never give prescriptive coaching advice"*.
- `matchup-intelligence.ts`, `team-dna.ts`, `why-they-won.ts`, `player-similarity.ts`, lineups/minutes.
- Schema: `TrainingSession`, `AthleteTrainingRecord` (has `developmentFocus`, `coachRating`),
  `AthleteTrainingMetric` + `TrainingMetricDefinition`, `ScoutReport`.
- Data: Season Zero + LBCL Games 1-33 (box-score level). `GameEvent.x / y / courtZone` are all null.
- **Nothing yet** produces development plans, drills, targets, or a game plan.

**Vision side:**
- G.21 schema (`GameVideo`, `CourtCalibration`, `VisionModel`, `VisionAnalysisRun`, `VisionTrack`,
  `VisionObservation`, `VisionSpatialSummary`), 25 docs in `documentation/vision/`, TS foundations in
  `lib/vision/` (homography, four-point rule, calibration quality, tracking/detection metrics,
  canonical-event alignment), `/vision` admin pages.
- `services/vision` = **B0 done** (FastAPI + Celery + Redis, stub analyzer, 5 tests). B1-B5 not started.
- Hard blocker: no real Ultra/LBCL game video and no measured court geometry yet.

**The key design tension:** the codebase's analytics rule is "describe the number, never prescribe".
A coaching assistant *is* prescriptive. Prompt C0 resolves this with an ADR before any code:
prescriptive output lives only in a coach-private layer, and every recommendation must cite its evidence.

## Run order

| # | Prompt | Track | Depends on |
|---|---|---|---|
| C0 | ADR + access model | Coaching | — |
| C1 | Player Development Engine | Coaching | C0 |
| C2 | Opponent Game Plan Engine | Coaching | C0 |
| C3 | Coach Hub UI + printable sheets | Coaching | C1, C2 |
| C4 | Grounded AI briefing (optional, flagged) | Coaching | C3 |
| V0 | Footage capture + court geometry + gold set | Vision | — (start now, mostly human) |
| B1 | Inference service wiring | Vision | B0 |
| B2 | Detection, tracking, team ID, homography | Vision | B1, V0 footage |
| B3 | Derived metrics + shot locations (game AND training) | Vision | B2 |
| B4 | Review queue + training-metric promotion | Vision | B3 |
| C5 | Vision signals into the Coaching Assistant | Both | C1-C3, B4 |

C-track and V0/B1 can run in parallel. C1 and C2 can run in parallel after C0.

---

## Standing rules (paste at the top of EVERY prompt)

```
You are working in C:\UltraLeagueOS (repo tex-node/ultraOS). Read AGENTS.md, the last ~300 lines
of session.md, and documentation/PRODUCT_ROADMAP.md before writing code.

Non-negotiables:
- Canonical scoring tables (GameEvent, PlayerStat, TeamStat, Standing) are written ONLY through
  the existing canonical write path. Analytics, coaching and vision code never write them.
- Tenant data goes through organization context (withOrganizationContext / org-aware helpers);
  every new tenant table gets organizationId + RLS, matching existing migrations.
- Never edit an existing migration. Additive migrations only. Apply to staging first; production
  only after I approve.
- New features ship behind a feature flag that defaults OFF in production.
- Pure computation lives in web/src/lib/** as pure functions with unit tests on fixture data;
  pages stay thin.
- No fabricated numbers. If the sample is too small, say "insufficient data" with the sample size.
- Before finishing: tsc, lint, the full test suite, and build must pass. Run new engines against
  REAL staging data (LBCL 2026 season) and eyeball the output before calling it done.
- Append a dated entry to session.md (Objective / Completed / Verification / Next step), update
  PRODUCT_ROADMAP.md rows, small reviewable commits. Stop and report after each phase: files
  changed, tests, verification, open questions. If something conflicts with repo conventions,
  stop and ask.
```

---

## C0 — ADR-011: Coaching Assistant boundary and access model

```
Goal: settle the rules for a prescriptive, coach-private Coaching Assistant BEFORE building it.
No feature code in this phase except the access helper.

1. Write docs/adr/ADR-011-Coaching-Assistant.md (follow the existing ADR format in docs/adr/):
   - Context: lib/analytics is deliberately descriptive ("describe the number, not what to do",
     see player-development-context.ts). Coaches need prescriptive guidance: what each player must
     develop and how to beat a known opponent.
   - Decision: a new layer web/src/lib/coaching/ that CONSUMES lib/analytics outputs and MAY
     prescribe, under these rules:
     a) Coach-private only. Never rendered on public, broadcast, fan or athlete-public surfaces.
     b) Every recommendation carries an Evidence object: metric, player value, comparison
        baseline (league / position peers / opponent), sample size (games, attempts), threshold
        that fired, confidence (HIGH/MEDIUM/LOW from sample size).
     c) Sample-size gates per metric (e.g. FT% needs >= 15 FTA; 3P% >= 20 3PA; per-game rates
        >= 4 games). Below the gate -> "insufficient data", never a recommendation.
     d) Deterministic rules engine first. Any LLM text (C4) only rephrases the structured output
        and is validated against it.
     e) Signal sources are typed: BOX_SCORE, EVENT_LEDGER, TRAINING, VISION_REVIEWED. Vision
        signals enter only after human review (B4) and are always labelled.
   - Consequences + what is explicitly out of scope (injury/medical advice, contract/selection
     decisions).
2. Add ADR-011 to docs/adr/INDEX.md and add glossary terms (Development Plan, Focus Area,
   Game Plan, Key to the Game, Evidence, Confidence) to the domain glossary per docs/agents/domain.md.
3. Access model: replace the hardcoded single-email gate for coaching features with
   lib/coaching/access.ts:
   - canViewCoaching(user, seasonClubId): true for Staff with a coaching assignment to that
     SeasonClub (use the existing Staff <-> SeasonClub coaching relation from the coaches module),
     org admins, and the existing INSIGHTS_ACCESS_EMAILS override (keep it, so nothing I use today
     breaks).
   - A coach sees only their own club's development plans; game plans for any opponent in their
     competition.
   - Unauthorized -> notFound(), same pattern as /[vanitySlug]/insights.
   - Unit tests for every branch.
4. Add PRODUCT_ROADMAP.md section "P15 — Coaching Assistant" with rows C0-C5 (from
   docs/agents/prompts/2026-10-15-coaching-assistant-and-vision.md) and a feature flag
   COACHING_ASSISTANT (off in prod).
Stop and report.
```

## C1 — Player Development Engine

```
Goal: for every player on a coach's squad, a ranked development plan: what skill to develop,
why (evidence), a drill block, and a measurable target to track.

Build web/src/lib/coaching/player-development.ts (pure) + tests.

Inputs: the same GameCore/PlayerLine shapes used by player-dna.ts and opponent-scouting.ts, the
event ledger where available, league + position-peer baselines, and AthleteTrainingRecord /
AthleteTrainingMetric history.

1. Skill dimensions (reuse PlayerDna dimension keys where they exist, add the rest):
   scoring efficiency (TS%), shot diet by basePointValue 1/2/3/4 incl. four-point attempts and
   make rate, free throws, playmaking (AST, AST/TO), ball security, offensive and defensive
   rebounding rate, defensive activity (STL+BLK), foul discipline (fouls per minute, foul-outs),
   Ultra Time performance (isUltraTime events), minutes/lineup impact (use
   documentation/analytics/PLAYER_MINUTES_AND_LINEUPS.md logic where minutes exist).
2. For each dimension compute: value, position-peer percentile (fallback to league when fewer
   than 5 peers), trend over the last 5 games vs the season, confidence from sample size.
3. Priority score = gap-below-peer-median x role-impact weight x confidence. Role-impact weights
   come from position (e.g. guards weight ball security and playmaking higher; bigs weight
   rebounding and FT) and live in a typed config, not magic numbers in code.
4. Output per player: top 3 Focus Areas, each = { dimension, evidence, why it matters in one
   sentence built from a template, drillBlock, target }, plus top 2 Strengths to keep using.
5. Drill catalog: a code registry web/src/lib/coaching/drills.ts (id, name, dimension, level,
   duration, equipment, coaching points, success measure). 4-6 drills per dimension, basketball-
   standard (e.g. Mikan, form shooting ladder, 2-ball dribble series, box-out wars, closeout
   drill, 1-and-1 FT pressure). Mark it as a registry that can later be DB-overridden, matching
   the sport-definition registry pattern.
6. Targets are measurable and tied to a TrainingMetricDefinition key where one fits (e.g.
   "FT% from 58% to 65% over the next 6 games", "drill: 7/10 FT under fatigue"). Add any missing
   TrainingMetricDefinition rows via an idempotent seed, not ad hoc.
7. Write-back (behind the flag): a server action that lets a coach "Adopt plan" -> creates a
   CoachingPlan row (new additive table: organizationId, playerId, seasonClubId, createdById,
   focusAreas Json, targets Json, status ACTIVE/ARCHIVED, evidence snapshot Json) and sets
   AthleteTrainingRecord.developmentFocus on future training sessions. Progress = later games +
   AthleteTrainingMetric values vs the target.
8. Tests: fixtures for a high-usage inefficient guard, a big with poor FT, a small-sample bench
   player (must return insufficient data), and a player with no weaknesses vs peers.
9. Run it against the real LBCL 2026 squad on staging; paste 3 sample plans into session.md and
   sanity-check the numbers against the box scores.
Stop and report.
```

## C2 — Opponent Game Plan Engine

```
Goal: turn the existing descriptive opponent scouting into a prescriptive game plan for beating a
specific opponent, for any SeasonClub (not just "Ultra Basketball").

Build web/src/lib/coaching/game-plan.ts (pure) on top of buildOpponentScoutingReports, team-dna,
matchup-intelligence and player analytics. Do not change the existing descriptive module's output.

1. Generalize: focus team = any SeasonClub the coach can access (remove the hardcoded
   FOCUS_TEAM_NAME dependency in the new path; keep the old LBCL page working).
2. Opponent profile: usage concentration (top-2 share of points), shot diet incl. 3 and 4-point
   reliance and efficiency, FT reliability per player, turnover rate, offensive rebounding, foul
   rate and foul-trouble players, bench dependency (bench points share), first- vs second-half
   and Ultra Time splits, recent form (last 3 games), H2H history.
3. Matchup layer: compare the focus team's strengths (from its own Team DNA and player plans) to
   the opponent's weaknesses, and the opponent's strengths to the focus team's weaknesses.
4. Output a GamePlan:
   - 3-5 Keys to the Game, each { key, rationale template, evidence, confidence }.
     Example shapes: "Deny #11 — 34% usage, team scores 18% fewer points when he sits",
     "Foul #4 late — 48% FT on 21 FTA", "Crash the offensive glass — they allow 14 OREB/game".
   - Defensive assignments: suggested primary defender for each opponent top-3 threat, chosen by
     the focus team's defensive activity + position + height/wingspan from Athlete/Player
     records; show the reasoning, allow the coach to override.
   - Ultra Time plan (final-minute 2x multiplier): who takes shots, who to deny, foul strategy.
   - Rotation notes: opponent bench weakness windows, focus team's best-performing lineups vs
     similar opponents (team-similarity.ts) where data exists.
   - "What would beat us": the opponent's most likely path to winning, from the inverse matchup.
5. Post-game review: buildGamePlanReview(plan, finishedGame) -> for each key, HELD / BROKEN /
   NOT_TESTABLE with the actual number. This is how coaches learn to trust it.
6. Tests with fixtures, including opponent-not-yet-played (H2H empty) and tiny samples.
7. Run against LBCL staging for Ultra Basketball's next 3 opponents; paste output in session.md
   and cross-check numbers against box scores.
Stop and report.
```

## C3 — Coach Hub UI + printable sheets

```
Goal: one place a coach opens before training and before a game.

Use the Neon Ultra design system (UI/NEON_ULTRA_CLAUDE_DESIGN_SYSTEM.md,
UI/design_handoff_neon_ultra/). Mobile-first: coaches will use phones courtside.

Routes (flag COACHING_ASSISTANT, access via lib/coaching/access.ts, notFound() otherwise):
- /coaching                       -> club picker (if >1) and hub
- /coaching/[seasonClubId]/squad  -> player cards: top focus areas, strengths, adopted plan
                                     progress (target vs current), link to drills
- /coaching/[seasonClubId]/players/[playerId] -> full plan, evidence table, trend sparkline,
                                     "Adopt plan" / "Archive plan"
- /coaching/[seasonClubId]/opponents/[opponentSeasonClubId] -> game plan, editable defensive
                                     assignments, notes
- /coaching/[seasonClubId]/review/[gameId] -> post-game plan review
- Printable: pre-game sheet (one A4 page: keys, assignments, Ultra Time plan, opponent top 3)
  and a training-week sheet (focus areas per player + drill blocks). Use print CSS; add PDF
  export only if a PDF path already exists in the repo.
Every number on screen shows its evidence on tap (sample size + baseline) and a confidence chip.
Low confidence is visually quieter, never hidden.
Add the LBCL Insights tab link to the new game-plan page for the existing gated user.
Add a jsdom component test per page (see docs/patterns/component-testing.md) and a Playwright
smoke test for the access gate (anonymous -> 404).
Stop and report with screenshots.
```

## C4 — Grounded AI briefing (optional, flag COACHING_AI_BRIEFING, off)

```
Goal: a short spoken-style briefing ("Here's how we beat Lagos Raptors...") generated from the
structured GamePlan / DevelopmentPlan. The LLM never computes anything.

1. lib/coaching/briefing.ts: build a prompt from the plan JSON only. Server-side call to the
   Claude API (model id from env, key from env, never client-side). Output is JSON:
   { paragraphs: [{ text, citedKeys: string[] }] }.
2. Validator: reject the output if any number in the text does not appear in the input JSON, or
   if a paragraph cites a key that doesn't exist. On rejection, fall back to the template text.
3. Cache per (planId, planHash). Log tokens and cost per call. Hard monthly budget env var.
4. Tests: validator catches an invented percentage; fallback path works with no API key.
Ask me before choosing the model and before enabling on staging.
Stop and report.
```

---

## V0 — Footage capture, court geometry, gold set (start now; mostly human + docs)

```
Goal: remove the hard blocker for vision. No ML code in this phase.

1. Write documentation/vision/CAPTURE_PROTOCOL.md for our venues:
   - Primary camera: fixed, elevated (>= 4 m), centre line, whole court in frame, 1080p at 50/60
     fps, locked exposure/focus, no zoom/pan, landscape. Optional second camera behind a basket.
   - Phone-on-tripod fallback spec (cheap Season Zero / LBCL option) and recommended settings.
   - Per game: a 10-second clip of the empty court before tip-off (for calibration), scoreboard
     visible if possible, a clap/buzzer sync mark at tip-off for VIDEO_GAME_TIMELINE_SYNC.md.
   - Training sessions: same camera rules; one drill per clip, start/stop announced on camera.
   - File naming, upload path (existing GameVideo registry + VIDEO_INGESTION_PIPELINE.md),
     retention (90 days raw), consent/privacy notes per PRIVACY_AND_IDENTITY_BOUNDARIES.md,
     especially for under-18 athletes.
2. Court geometry: a printable measurement form (court length/width, 3-pt arc radius, Ultra
   four-point line geometry, key width, FT line, rim position) matching
   ULTRA_COURT_SPECIFICATION.md fields, plus an admin page or script to enter the measured values
   per venue and create the CourtCalibration reference geometry.
3. Gold set: choose the annotation format (recommend CVAT -> MOT/COCO export), write
   documentation/vision/GOLD_SET_PLAN.md: 3 x 10-minute clips, annotate player boxes + track ids
   + jersey numbers + ball every 5th frame, plus event timestamps for shots/passes/rebounds.
   Document how VISION_GROUND_TRUTH_EVALUATION.md consumes it.
4. Register the first real clips I provide via the existing /vision/videos flow on staging.
Stop and report with a checklist of what I (the human) must do at the next game.
```

## B1 — Inference service wiring

```
Goal: complete Phase B1 in PRODUCT_ROADMAP.md on top of the B0 shell in services/vision.

1. Auth: service-account credential for /analyze (shared secret or signed JWT from Next.js),
   DB role scoped to Vision* tables + read-only GameVideo/CourtCalibration (no canonical tables).
   Add a test that the role cannot INSERT into GameEvent/PlayerStat.
2. Next.js trigger: "Analyze" button on /vision/videos for READY_FOR_ANALYSIS videos, calls the
   service with the real requesting user (remove _fallback_requester), shows run status.
3. Storage: implement download_segment (R2/S3 via boto3 + local-disk adapter for dev) and a
   frame sampler (PyAV or ffmpeg) that yields frames at a configurable fps (default 15) with
   timestamps aligned to VideoTimelineAnchor.
4. Real lifecycle integration test against Postgres (per-schema isolation like A3b Commit 1):
   upload -> QUEUED -> PROCESSING -> COMPLETED with the stub; FAILED path records the error.
5. Compute decision: document options in documentation/vision/VISION_WORKER_ARCHITECTURE.md —
   (a) local GPU workstation running the worker, (b) on-demand cloud GPU, (c) CPU-only ONNX at low
   fps for short clips. Our VPS has no GPU. Recommend one; ask me before provisioning anything paid.
6. OpenTelemetry trace or structured log per run (duration, frames, fps).
Stop and report.
```

## B2 — Detection, tracking, team identification, court mapping

```
Goal: real VisionTrack rows from real footage. Read PLAYER_DETECTION_EVALUATION.md,
MULTI_OBJECT_TRACKING_EVALUATION.md, TRAJECTORY_STORAGE_FORMAT.md, COURT_CALIBRATION.md,
FOUR_POINT_SPATIAL_RULE.md first.

1. Detector: start ZERO-SHOT with a pretrained COCO model (person + sports ball) exported to
   ONNX and served by ONNX Runtime. Baseline RF-DETR (Apache-2.0). Do NOT adopt Ultralytics YOLO
   weights/code without flagging to me: they are AGPL-3.0 and would affect our commercial plans.
   Measure on the V0 gold set before any fine-tuning; fine-tune only if below target.
2. Tracker: ByteTrack (or BoT-SORT) with stable track ids; handle occlusion re-entry.
3. Team assignment (missing from the roadmap, required): k-means / colour-histogram on torso
   crops per track -> TEAM_A / TEAM_B / REFEREE / OTHER, then map to home/away SeasonClub using
   the club colours or a one-click manual mapping in the review UI.
4. Court filtering + mapping: compute the homography from CourtCalibration using the SAME
   geometry as web/src/lib/vision/court-homography.ts — export the court spec to a shared JSON
   so TS and Python can't drift; add a parity test with identical points in both languages.
   Drop detections outside the court polygon (bench, crowd).
5. Jersey OCR: crop -> PARSeq/TrOCR or a small CNN; vote across a track's frames; join to the
   game roster (Player jersey numbers). Low-confidence identity stays UNRESOLVED and goes to
   review; never guess (PLAYER_IDENTITY_CONSTRAINTS rules in lib/vision).
6. Write VisionTrack rows (frameIndex, courtX, courtY, bbox, confidence, trackId, team) per
   TRAJECTORY_STORAGE_FORMAT.md; record the VisionModel row (name, version, weights hash) on
   the run.
7. Evaluate on the gold set with the existing metric code (detection-metrics, tracking-metrics):
   targets track continuity >= 95%, jersey ID >= 90%, ball recall >= 85%. Report actual numbers
   honestly even if below target, with the failure cases logged per VISION_FAILURE_CASES.md.
Stop and report.
```

## B3 — Derived metrics for games AND training

```
Goal: turn tracks into coach-useful observations. Everything written as VisionObservation /
VisionSpatialSummary with status PENDING and sourceRunId. Nothing canonical.

Game mode:
1. Movement: Savitzky-Golay smoothed speed, top speed, distance covered, sprint count
   (threshold in config), per player per period.
2. Spatial: heatmaps and average position -> VisionSpatialSummary; time in paint, zone usage.
3. Possession & passes: ball-holder model (nearest player + ball proximity + min travel +
   teammate check) -> PASS observations, passing network per team.
4. Shot locations: detect shot release (ball leaves holder toward rim, rising trajectory), map
   release point to court coordinates and court zone (incl. four-point zone via
   four-point-spatial-rule), and align to the SHOT_ATTEMPT / SHOT_MADE / SHOT_MISSED GameEvent
   by video-timeline sync + player. Output a SHOT_LOCATION observation linked to the candidate
   GameEvent — do NOT write GameEvent.x/y (see open decision in B4).
5. Pace: possessions per minute, transition vs half-court.
Training mode (TrainingSession video, no GameEvents):
6. Drill analytics: shooting reps (attempts, makes by zone), sprint/agility times between court
   landmarks, defensive slide distance, reps per minute. Output TRAINING_* observations tied to
   TrainingSession + Athlete.
Targets: pass F1 >= 0.80, speed MAE <= 0.5 km/h on annotated clips; report actuals.
Stop and report.
```

## B4 — Review queue + promotion rules

```
Goal: a reviewer clears a full game's observations in < 10 minutes.

1. Extend /vision/games/[fixtureId] review console: grouped by player and type, each item shows
   a 4-second clip (VISION_REVIEW_CLIPS.md), confidence, and Confirm / Correct / Reject with
   failure category. Bulk-confirm high-confidence groups; bulk-reject a whole run.
2. Game data stays non-canonical (existing boundary test must stay green). Reviewed observations
   are readable by the Coaching Assistant as VISION_REVIEWED signals.
3. Training data: a confirmed TRAINING_* observation may create an AthleteTrainingMetric row
   (training metrics are not canonical scoring data). Write an ADR addendum to ADR-011 first and
   record provenance (observationId, reviewerId) on the metric.
4. OPEN DECISION — ask me before implementing: should a CONFIRMED SHOT_LOCATION be allowed to
   fill the null GameEvent.x / y / courtZone through the canonical write path as a correction
   with source tagging? It would unlock real shot charts, but it changes the current
   "vision never touches GameEvent" rule. Draft the trade-off; do not build it.
Stop and report.
```

## C5 — Vision signals into the Coaching Assistant

```
Goal: development plans and game plans use reviewed vision data when it exists.

1. Add VISION_REVIEWED and TRAINING sources to the C1 dimension inputs: conditioning (distance,
   sprints, top speed trend), shot diet by zone and four-point zone efficiency, off-ball movement
   (time in paint, spacing), defensive slide/closeout speed from training video.
2. Game plans gain opponent shot charts and zone tendencies when their games have reviewed
   vision data ("they take 62% of 3s from the left corner").
3. Every vision-derived number shows a "Vision · reviewed" badge, model version, and a link to
   the source clip. Plans computed without vision data are unchanged (regression test).
4. Coach player page: speed/distance trend, heatmap, shot chart.
Stop and report.
```

---

## Decisions only you can make (agents will stop and ask)

1. **Who can see coaching data** — coaches only for their own club? Assistant coaches? Players
   seeing their own development plan (a softened, athlete-facing version)?
2. **AI briefing (C4)** — allowed at all, which model, monthly budget.
3. **Where vision inference runs** — local GPU PC, rented cloud GPU, or CPU-only for short clips.
4. **Camera setup** for LBCL / Season One — fixed elevated camera vs phone tripod; who records.
5. **Detector licence** — RF-DETR (Apache-2.0, safe for commercial) vs Ultralytics YOLO (AGPL).
6. **Shot locations into GameEvent** — keep vision fully non-canonical, or allow reviewed shot
   locations to fill x/y through the canonical correction path.
