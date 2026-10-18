import type { OcrPage, OcrWord } from "@/lib/ocr/provider";
import { groupIntoRows } from "@/lib/ocr/rows";
import type { ScoresheetColumn, ScoresheetColumnKey, ScoresheetLayout } from "./templates";

// Table-structure detection and cell mapping for a printed basketball box score (P15 I1).
//
// The algorithm is deliberately geometric rather than model-based, because that is what makes it
// explainable in a review queue:
//   1. Find the header row: the row whose words match the most column headers from the layout.
//   2. Turn the matched header words into column ANCHORS (their x-centre). This is what makes one
//      layout definition survive different crops/scales - there are no hard-coded fractions.
//   3. Every row below the header is a player row or the totals row (matched by its first words).
//   4. Words in a row are assigned to the nearest anchor, concatenated per column, and parsed.
//   5. A per-row confidence is the mean of the confidences of the words that were actually used, so
//      a row read from a smudge is visibly worse than a clean one.
//
// It does not try to read handwriting, rotated photos (> ~5 degrees), or a sheet whose header is
// missing. Those produce warnings and low confidence, and the import goes to review - which is the
// only path into the canonical pipeline anyway.

export type ExtractedCell = { raw: string; value: number | null; confidence: number };

export type ExtractedPlayerRow = {
  rowIndex: number;
  jerseyNumber: number | null;
  name: string;
  minutesRaw: string;
  didNotPlay: boolean;
  cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>;
  confidence: number;
};

export type ExtractedTeamTable = {
  teamLabel: string | null;
  headerRowIndex: number;
  players: ExtractedPlayerRow[];
  totals: Partial<Record<ScoresheetColumnKey, ExtractedCell>>;
  confidence: number;
  warnings: string[];
};

export type ScoresheetExtraction = {
  version: string;
  layoutKey: string;
  teams: ExtractedTeamTable[];
  warnings: string[];
  headerFound: boolean;
  pagesRead: number;
};

const NUMERIC = /^-?\d+(\.\d+)?$/;

function wordConfidence(word: OcrWord): number {
  // Tesseract reports -1 for a word it kept but did not score; treat that as low, not as zero.
  return word.confidence < 0 ? 30 : word.confidence;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Match a header word-group against a column's header aliases. Exact match first, then "starts with"
// for things like "PTS:" or "MIN." - conservative on purpose: a wrong column mapping is worse than
// an unmatched one, because it silently puts assists in the rebounds column.
function columnForHeader(text: string, layout: ScoresheetLayout): ScoresheetColumn | null {
  const t = normalizeText(text).replace(/[.:]/g, "");
  if (!t) return null;
  let best: { column: ScoresheetColumn; score: number } | null = null;
  for (const column of layout.columns) {
    for (const header of column.headers) {
      const h = normalizeText(header).replace(/[.:]/g, "");
      const score = t === h ? 2 : t.replace(/\s/g, "") === h.replace(/\s/g, "") ? 2 : t.startsWith(`${h} `) || t === `${h}s` ? 1 : 0;
      if (score > 0 && (!best || score > best.score)) best = { column, score };
    }
  }
  return best?.column ?? null;
}

type Anchor = { column: ScoresheetColumn; x: number; index: number };

function findHeader(rows: OcrWord[][], layout: ScoresheetLayout): { index: number; anchors: Anchor[] } | null {
  const best: { index: number; anchors: Anchor[]; score: number } | null = null;
  let result: { index: number; anchors: Anchor[]; score: number } | null = best;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const anchors: Anchor[] = [];
    // Consecutive words can form one header ("Off Reb"); try pairs as well as singles.
    for (let i = 0; i < row.length; i += 1) {
      const single = columnForHeader(row[i].text, layout);
      const pair = i + 1 < row.length ? columnForHeader(`${row[i].text} ${row[i + 1].text}`, layout) : null;
      const hit = pair && (!single || pair.key !== single.key) ? pair : single;
      if (hit && !anchors.some((a) => a.column.key === hit.key)) {
        anchors.push({ column: hit, x: (row[i].x0 + row[i].x1) / 2, index: anchors.length });
      }
    }
    const distinct = new Set(anchors.map((a) => a.column.key)).size;
    if (distinct >= 3 && (!result || distinct > result.score)) result = { index, anchors, score: distinct };
  }
  return result ? { index: result.index, anchors: result.anchors } : null;
}

function isTotalsRow(row: OcrWord[], layout: ScoresheetLayout): boolean {
  const text = normalizeText(row.map((w) => w.text).join(" "));
  return layout.totalsLabels.some((label) => text === label || text.startsWith(`${label} `) || text.includes(` ${label}`));
}

function nearestAnchor(x: number, anchors: Anchor[]): Anchor {
  let best = anchors[0];
  for (const anchor of anchors) if (Math.abs(anchor.x - x) < Math.abs(best.x - x)) best = anchor;
  return best;
}

function parseCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (!NUMERIC.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// Split a made-attempted pair ("6-14", "6/14") for columns that declare one.
function splitPaired(raw: string, column: ScoresheetColumn): { made: number | null; attempted: number | null } | null {
  if (!column.pairKey) return null;
  const separator = column.pairSeparator ?? "-";
  const parts = raw.split(separator);
  if (parts.length !== 2) return null;
  const made = parseCell(parts[0]);
  const attempted = parseCell(parts[1]);
  if (made === null && attempted === null) return null;
  return { made, attempted };
}

function rowCells(row: OcrWord[], anchors: Anchor[]): { cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>; used: OcrWord[] } {
  const buckets = new Map<ScoresheetColumnKey, OcrWord[]>();
  for (const word of row) {
    const anchor = nearestAnchor((word.x0 + word.x1) / 2, anchors);
    const list = buckets.get(anchor.column.key) ?? [];
    list.push(word);
    buckets.set(anchor.column.key, list);
  }
  const cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>> = {};
  const used: OcrWord[] = [];
  for (const [key, words] of buckets) {
    const ordered = [...words].sort((a, b) => a.x0 - b.x0);
    const raw = ordered.map((w) => w.text).join(" ").trim();
    used.push(...ordered);
    if (raw) cells[key] = { raw, value: parseCell(raw), confidence: Math.round(mean(ordered.map(wordConfidence))) };
  }
  return { cells, used };
}

function applyPairs(cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>, layout: ScoresheetLayout): void {
  for (const column of layout.columns) {
    const cell = cells[column.key];
    if (!cell || !column.pairKey) continue;
    const pair = splitPaired(cell.raw, column);
    if (!pair) continue;
    cell.value = pair.made;
    if (pair.attempted !== null && cells[column.pairKey] == null) {
      cells[column.pairKey] = { raw: String(pair.attempted), value: pair.attempted, confidence: cell.confidence };
    }
  }
}

export type ExtractOptions = {
  layout: ScoresheetLayout;
  /** Page number the words came from, for the extraction record. */
  page?: number;
};

export function extractTeamTables(page: OcrPage, options: ExtractOptions): ExtractedTeamTable[] {
  const { layout } = options;
  const rows = groupIntoRows(page.words);
  const header = findHeader(rows, layout);
  if (!header) return [];

  const anchors = header.anchors;
  const tables: ExtractedTeamTable[] = [];
  let current: ExtractedTeamTable = {
    teamLabel: null,
    headerRowIndex: header.index,
    players: [],
    totals: {},
    confidence: 0,
    warnings: [],
  };

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 0) continue;
    // A second header row means a second team block on the same page - start a new table.
    if (findHeader([row], layout)) {
      finishTable(current);
      if (current.players.length > 0 || Object.keys(current.totals).length > 0) tables.push(current);
      current = { teamLabel: null, headerRowIndex: i, players: [], totals: {}, confidence: 0, warnings: [] };
      continue;
    }
    if (isTotalsRow(row, layout)) {
      const { cells } = rowCells(row, anchors);
      applyPairs(cells, layout);
      current.totals = cells;
      continue;
    }
    const { cells, used } = rowCells(row, anchors);
    applyPairs(cells, layout);
    const jerseyCell = cells.jersey;
    const nameCell = cells.name;
    const jerseyNumber = jerseyCell?.value ?? (jerseyCell ? parseCell(jerseyCell.raw) : null);
    // A player row needs a name or a jersey number; a stray row of numbers is not a player.
    if (!nameCell && jerseyNumber === null) continue;
    const minutesRaw = cells.minutes?.raw ?? "";
    const rowText = normalizeText(row.map((w) => w.text).join(" "));
    const didNotPlay = layout.dnpMarkers.some((marker) => marker.length > 0 && (normalizeText(minutesRaw) === marker || rowText.endsWith(` ${marker}`)));
    const confidence = Math.round(mean(used.map(wordConfidence)));
    current.players.push({
      rowIndex: i,
      jerseyNumber,
      name: nameCell?.raw ?? "",
      minutesRaw,
      didNotPlay,
      cells,
      confidence,
    });
    current.warnings.push(...rowWarnings(cells, i));
  }
  finishTable(current);
  if (current.players.length > 0 || Object.keys(current.totals).length > 0) tables.push(current);
  return tables;
}

function rowWarnings(cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>, rowIndex: number): string[] {
  const warnings: string[] = [];
  const points = cells.points;
  if (!points) warnings.push(`Row ${rowIndex + 1}: no points cell - the row may be misaligned with the header.`);
  else if (points.value === null) warnings.push(`Row ${rowIndex + 1}: points cell "${points.raw}" is not a number.`);
  if (points && points.confidence < 60) warnings.push(`Row ${rowIndex + 1}: low OCR confidence on points (${points.confidence}%).`);
  return warnings;
}

function finishTable(table: ExtractedTeamTable): void {
  const confidences = table.players.map((p) => p.confidence).filter((c) => c > 0);
  table.confidence = Math.round(mean(confidences));
}

export function extractScoresheet(pages: OcrPage[], options: ExtractOptions & { version: string }): ScoresheetExtraction {
  const teams: ExtractedTeamTable[] = [];
  for (const page of pages) teams.push(...extractTeamTables(page, options));
  const warnings: string[] = [];
  if (teams.length === 0) {
    warnings.push("No table header was found. The sheet may be rotated, cropped, or in a layout this template does not describe.");
  }
  if (teams.length === 1) warnings.push("Only one team table was detected - check whether the second team is on another page or was cropped out.");
  return {
    version: options.version,
    layoutKey: options.layout.key,
    teams,
    warnings,
    headerFound: teams.length > 0,
    pagesRead: pages.length,
  };
}
