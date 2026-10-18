# OCR scoresheet ingestion (P15 I1) - state, acceptance run, and why it is not finished

Written 2026-10-18. Status: **pivoted to CSV/Excel.** The image path is shipped but measured as not
operator-ready (0 review-ready sheets from 20 real captures); the structured path round-trips all 32 real
LBCL games with zero field differences. This document exists so nobody reads the code and assumes OCR works
on LBCL's sheets.

## Data corrections this pipeline found (2026-10-18)

The checksums are the reason this feature is worth having: running the real batch through them found
**four arithmetic inconsistencies the hand transcription had carried into the database**. Two games, three
players, eight field edits; applied to `scripts/data/lbcl-2026-batch1.json` **and** to the already-ingested
`PlayerStat` rows in staging and production (`scripts/fix-lbcl-stats.ts`, audited as
`LBCL_BOX_SCORE_CORRECTED`).

The rule used, and the one to apply again if these are ever re-examined: **the printed team score and the
period sums are the anchor** (corroborated three independent ways on the sheet - final score line, per-period
line, team totals row), so a player's POINTS stay as printed and the COMPONENTS are corrected to match.

| game | player | change | confidence |
| --- | --- | --- | --- |
| 19 | Creon Okwuzu | `freeThrowsMade/Attempted 1 → 0` | **high** - FG 4/7 with 2P 4/7 is legible, so 4 twos = 8 points = printed PTS |
| 19 | Dele Ajigboye | `freeThrowsMade 2 → 1`, `threePointsAttempted 1 → 0` | **high** - 3 twos + 1 FT = 7 = printed PTS, and FGA 7 = 2PA 7 + 3PA 0 |
| 20 | Nnerive Peter | `twoPointsMade/Attempted`, `fieldGoalsMade/Attempted` `1 → 2` | **medium - SCORE-ANCHORED, not read from the cell** |

**Nnerive Peter deserves a permanent flag.** Game 20 (Campos 48 - 40 Ogra Hoop Kings), Ogra #10. The FG
pair on the 720px capture reads `1/1` while the PTS column reads `4`, and the team total (40) only works
with 4 points. The components were therefore raised to two two-pointers to satisfy the points identity, and
**the source pair was never confirmed**. Consequences: this row's `2PM/2PA/FGM/FGA`, and the team's
two-point total (which nothing else checksums), may both be one high. If the original Genius export ever
surfaces, re-read this row before trusting its shooting splits - the points are safe, the shot profile is
not.

## What is built

- `ScoresheetTemplate` + `ScoresheetImport` (migration `20261018140000_scoresheet_ocr_ingestion`),
  both tenant tables with RLS enabled **and forced**, policies, and runtime-role GRANTs in the same
  file. Applied to staging after a verified backup; a `SELECT` as the app role works (the check that
  caught the `CoachingPlan` grants bug).
- `src/lib/ocr/provider.ts` - the provider seam (words with boxes and confidences; `OCR_UNAVAILABLE`
  rather than a fabricated table) and `src/lib/ocr/tesseract.ts` - the host-binary provider
  (tesseract 5.3.4 + eng installed on the VPS, `--psm 6`, TSV parsing, engine version recorded).
- `src/lib/scoresheet/templates.ts` - LBCL and FIBA layouts as data: columns identified by their
  printed header words, made-attempted pairs, DNP markers, totals labels.
- `src/lib/scoresheet/extract.ts` - header detection -> column anchors -> row/cell mapping with
  per-row confidence and warnings instead of silent zeros.
- `src/lib/scoresheet/checksums.ts` - the `verify-batch.mjs` rules in code (points identity,
  FGM/FGA identities, made <= attempted, team sums vs printed totals, quarter sums).
- Review queue `/scoresheets` (upload + list) and `/scoresheets/[id]/review` (image, editable cells,
  checksum panel, approve/reject). Approval is refused while any check fails.
- `external-stats-ingest.ts --scoresheetImportId <id>` ingests an **APPROVED** import through the
  same `ingestBoxScoreGame` pipeline a hand-typed batch uses, then marks the import INGESTED.

## Acceptance run (the part that failed)

Method: `scripts/scoresheet-ocr-batch.ts` over 20 real sheet images from `lbcl/` (the same files the
LBCL batches were transcribed from), tesseract 5.3.4, the LBCL layout, checksums computed per sheet.
Nothing was written to any database.

| Metric | Result |
| --- | --- |
| Sheets run | 20 |
| Sheets where a header was found **and** players were read | **0** |
| Sheets where a header was found at all | 2 (both with 0 player rows parsed) |
| Sheets rejected with "No table header was found" | 18 |
| Mean OCR time per sheet | ~4.1 s |
| Human review time measured | **not measurable** - there was nothing usable to review |

The pipeline did not silently invent data on any sheet: every failure is a FAILED import with a
reason, and the two "header found" cases produced zero player rows, which the review page would show
as empty tables.

## Why it failed - the real sheet architecture

The images are **screenshots of Genius Sports FIBA box scores** (LBCL publishes them on Instagram;
the captured image includes the Instagram chrome). One image holds **two team blocks**. Each block's
header is **two rows**:

```
Field Goals | 2 Points | 3 Points | Free Throws | Rebounds | Fouls
    MA  %   |  MA  %   |  MA  %   |   MA   %    | OR DR TOT | PF FD
```

and the full column list is
`No | Name | Min | FG M A % | 2P M A % | 3P M A % | FT M A % | OR DR TOT | AS TO ST BS | PF FD | +/- | EF | PTS`.

Two iterations were built and measured against the real images, and **both still read nothing**:

1. **Flat single-row header** (v1): only a handful of the group-row words match the flat column
   aliases, and the sub-labels that do match ("M", "%") repeat fourteen times, so anchors collapse.
   18/20 sheets: "no table header".
2. **Grouped two-row header** (v1.1, implemented and tested): the group-label row IS detected on the
   sample sheet and the Totals row maps correctly, but the group labels' centres do not line up with
   the data columns underneath them, so player rows yield no numeric cells. Measured on the sample at
   2400 px width (after the upscale): the "Field Goals" label centre is x≈965 while the first
   sub-column (M) starts at x≈810, and a player row's cells span x≈700-2230 while the group band
   covers only part of that. The screenshot's header row is horizontally compressed and its words are
   frequently merged ("FiekiGoals", "3 Points" split across words), so label positions are not a
   reliable proxy for the column grid.

**This is a layout-analysis gap, not a broken pipeline.** The geometry, the checksums, the review queue
and the ingest path are exercised by 7 unit tests and work on a flat printed table; what they cannot do
is recover the column grid from these images.

## What would fix it (in order of value)

1. **Derive columns from the DATA, not the header.** Cluster the x-centres of numeric words across all
   rows into vertical bands (a projection profile), then map the bands left-to-right using the layout's
   declared column order. This is how table extraction normally works and it is immune to the header
   compression above. The checksums then act as the guard: the points identity and the Totals
   comparison fail loudly if the order is wrong.
2. **Image preprocessing** - already added (2x-3x upscale, greyscale, sharpen; `OCR_PREPROCESS=off`
   disables it). It improved header word recognition but cannot fix the geometric misalignment.
3. **Crop out the phone/Instagram chrome.** Every LBCL image has ~25% of its height as status bar and
   Instagram UI; the sheet is the middle band. A crop region per template removes a lot of noise (and
   the "B" / "POSTS" text that competes with the header row).
4. **Prefer the underlying PDF/export over a screenshot.** These sheets are generated by Genius; the
   same data as a PDF (or CSV) makes OCR unnecessary. Worth asking LBCL for the exported files -
   cheaper and more accurate than any OCR work.

## Second acceptance run (2026-10-18, after stronger preprocessing)

The first run's diagnosis said preprocessing was a prerequisite. It was the dominant factor. Measured
on a real sheet: clean numeric tokens per page **34 -> 127** with a 3x upscale plus a 3x3 median
filter and a sharpen, and player rows became readable (`5 JOCHENWORIE 20:17 5/8 62.5 4/4 100 ...`).
The provider now does exactly that (greyscale, 3x upscale to at least 3000px, `median(1)`,
`sharpen({sigma:1.5})`; `OCR_PREPROCESS=off` disables it).

Same 20 sheets, same harness, LBCL layout:

| Metric | First run | Second run |
| --- | --- | --- |
| Sheets where a table was detected | 2 | **12** |
| Sheets with at least one player row | **0** | **8** |
| Total player rows extracted | 0 | 195 (13-36 per sheet) |
| Mean confidence (non-empty tables) | - | ~53% |
| Warnings emitted | 20 | 12-49 per sheet |
| Sheets still rejected ("no table header") | 18 | 8 |
| Mean OCR time per sheet | 4.1 s | ~10 s |

**What this does and does not mean.** The pipeline now finds real rows on real sheets - that is a
qualitative change, not a tuning artefact. But **no sheet is review-ready**: the row counts are
unreliable in both directions (a 12-man team yields 13 rows on one sheet and 30 on another, so rows
are being split and duplicated), cell completeness is low (most `0` cells are still fused into
brackets and dropped), and with so few mapped cells the checksums generate almost no checks to fail -
so "0 failing checks" here means "nothing checkable", not "correct".

## Why it still is not operator-ready

1. **Row segmentation.** 30 rows for a 12-man team means the horizontal projection is splitting rows
   at the text baselines rather than at the printed row rules. Detecting the grid lines (a
   morphological pass over the image) and cutting rows/columns from the geometry is the fix; the
   current approach clusters words per text row, which is a proxy.
2. **Cell completeness.** Tesseract shatters the narrow `0` cells against the borders. Cropping each
   cell from the detected grid and OCR-ing it in isolation (single-character mode) is the reliable
   way, and it is only possible once the grid is detected.
3. **Header vs data.** The grouped header is found on some sheets but its labels still do not align
   with the columns, which is why the column model has to come from the grid, not the header.

Verdict unchanged: **do not enable for operators.** The difference is that the blocker is now
precisely "grid detection + per-cell OCR", not "the sheet design is unreadable". The cheapest path to
operator value is still to ask LBCL for the exported PDF/CSV, which removes OCR from the problem
entirely.

## Honest limitations of v1 as shipped

- Reads only a **flat, single-row header** printed table. That is not the LBCL/FIBA sheet design.
- **No rotation/deskew** handling: a photo more than a few degrees off is unreadable.
- **No handwriting** support (declared non-goal).
- The review page assumes up to **two team tables per image**; a design with one team per page leaves
  the second team empty for the reviewer to fill in.
- The ingest CLI resolves competition/division/season/venue from the organization's own latest season,
  so it is not yet a way to import a *new* league's history from sheets (that needs the batch-level
  metadata a batch file carries).

## Recommendation

Do not enable this for operators yet. Finish (1) and (2), re-run `scripts/scoresheet-ocr-batch.ts`
over the same 20 sheets, and only then measure review time against the ≤5 min/game target. Until a
sheet reads with the header found and the checksums passing, the review queue saves nobody time.
