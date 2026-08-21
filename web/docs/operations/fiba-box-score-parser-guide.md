# FIBA box score PDF parser: what it can and can't safely do

`src/lib/fiba-box-score-pdf-parser.ts` (`parseFibaBoxScoreText`) parses the *text* of a FIBA/
Genius Sports "FIBA Box Score" PDF export - the exact format used for every real Season Zero
game. It takes a raw extracted string (see "Extracting text" below) and returns a
`FibaBoxScoreParseResult`; it does not touch the database.

## Extracting text

Use `pdftotext <file> -` (no `-layout` flag). This was verified directly against a real Season
Zero PDF while building the parser: `-layout` mode actually produces *worse* alignment for this
specific template (rows visibly offset, columns overlapping) than the default reading-order
extraction. The parser is written against the non-`-layout` output.

## What it reliably extracts (verified against real Season Zero PDFs)

- **Header**: home/away team labels, final score, venue line, game number.
- **Roster**: jersey number, reported name, starter flag (`*` prefix), captain flag (`(C)`),
  and DNP status - a clean, always-present, space-separated list in this template.
- **Minutes played** per roster slot (or `"DNP"`).
- **Field Goals and Free Throws splits** (made/attempted/percent per player) - but *only* when
  the parser can either match the token count to the roster exactly, or arithmetic-verify that
  one extra trailing pair is the team-total row (its made/attempted sum exactly matches the sum
  of the player rows it follows - the same validation discipline used for hand transcription in
  `scripts/g84-import-season-zero-results.ts`). It is never a positional guess.

## What it deliberately never extracts (confirmed unsafe, not just untried)

- **2PT/3PT split** - this template interleaves the two token streams in one combined block in
  a way that can't be safely separated without the same positional-shift risk documented below.
- **All counting stats** - rebounds (OR/DR/TOT), assists, turnovers, steals, blocks, fouls
  (PF/FD), +/-, efficiency, points. Confirmed by direct inspection: this template silently
  drops the text for a blank/zero-value cell, which shifts every later token in that row by one
  position once the PDF's text layer is flattened - one real player row in the file used to
  build this parser rendered as `"1 1 2 1 0000014 2"` (six tokens where twelve distinct numbers
  were expected) with no reliable way to recover the intended split from text alone. Trusting a
  positional zip here would silently produce wrong stats for a real person.
- **Field Goals/Free Throws for a specific team, when the token count genuinely can't be
  reconciled** - e.g. APEX's Field Goals line in the file used to build this parser has only 6
  M/A pairs for 7 non-DNP players. This is a real ambiguity in that specific export, not a
  parser bug, and the parser correctly returns `null` rather than guessing which player is
  missing a cell.

Every field the parser refuses to extract is reported in `FibaBoxScoreParseResult.warnings`
with a specific reason, not silently omitted.

## Recommended workflow for a future PDF import

1. Run the parser to auto-fill header/score/period/roster/FG/FT data where it succeeds.
2. Manually transcribe 2PT/3PT and all counting stats from the source PDF, the same way the 11
   real Season Zero games were transcribed.
3. Run the same arithmetic pre-flight validation pattern as
   `scripts/g84-import-season-zero-results.ts`'s `validateGame()` (2PM+3PM=FGM,
   2PA+3PA=FGA, 2×2PM+3×3PM+FTM=PTS, team totals reconcile with the final score) **before**
   calling `importGameResult()`.
4. Never call `importGameResult()` on unvalidated data, and never treat this parser's output as
   a substitute for that validation step - it reduces transcription volume, it doesn't remove
   the need for it.

## Test coverage

`src/lib/fiba-box-score-pdf-parser.test.ts` uses the actual `pdftotext` output for a real
Season Zero PDF (APEX vs VORTEX, 15 Aug 2026) as its fixture - not a synthetic string - and
asserts against values cross-checked directly against the source PDF and the box score's own
team-total rows. It also asserts that the one genuinely ambiguous case (APEX's Field Goals)
correctly returns `null` rather than a guess.
