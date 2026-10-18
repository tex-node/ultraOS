import type { OcrPage, OcrWord } from "@/lib/ocr/provider";
import { groupIntoRows } from "@/lib/ocr/rows";
import type { ScoresheetColumn, ScoresheetColumnGroup, ScoresheetColumnKey, ScoresheetLayout } from "./templates";

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

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Match a header word-group against a column's header aliases. Exact match first, then "starts with"
// for things like "PTS:" or "MIN." - conservative on purpose: a wrong column mapping is worse than
// an unmatched one, because it silently puts assists in the rebounds column.
export function columnForHeader(text: string, layout: ScoresheetLayout): ScoresheetColumn | null {
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

// Grouped headers (FIBA/Genius sheets) print a group label above several sub-columns:
//
//     Field Goals | 2 Points | 3 Points | Free Throws | Rebounds | Fouls
//         M  A  %  |  M  A  %  |  M  A  %  |   M   A   %  | OR DR TOT | PF FD
//
// The sub-labels repeat ("M", "%") and are frequently the first thing OCR loses, so they are not
// usable as anchors. Instead each group label anchors a BLOCK: the block spans the midpoints between
// neighbouring group centres, and the block is split into as many equal slices as the layout declares
// sub-columns. That is enough to put the right number in the right stat when the group labels are
// readable, and it degrades visibly (empty cells, failing checksums) when they are not.
type GroupAnchor = { columns: (ScoresheetColumn | null)[]; left: number; right: number };

// Assigns a row's words to the grouped slices. A word goes to the slice whose horizontal band it
// falls in (clamped to the nearest band at the edges).
function groupedCells(row: OcrWord[], anchors: GroupAnchor[]): { cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>; used: OcrWord[] } {
  const cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>> = {};
  const buckets = new Map<ScoresheetColumn, OcrWord[]>();
  for (const word of row) {
    const x = (word.x0 + word.x1) / 2;
    const anchor = anchors.find((a) => x >= a.left && x < a.right) ?? anchors.reduce((best, a) => (Math.abs((a.left + a.right) / 2 - x) < Math.abs((best.left + best.right) / 2 - x) ? a : best), anchors[0]);
    if (!anchor) continue;
    const bandWidth = (anchor.right - anchor.left) / Math.max(1, anchor.columns.length);
    const slice = Math.min(anchor.columns.length - 1, Math.max(0, Math.floor((x - anchor.left) / bandWidth)));
    const column = anchor.columns[slice];
    if (!column) continue; // a "%" sub-column the layout deliberately ignores
    const list = buckets.get(column) ?? [];
    list.push(word);
    buckets.set(column, list);
  }
  const used: OcrWord[] = [];
  for (const [column, words] of buckets) {
    const ordered = [...words].sort((a, b) => a.x0 - b.x0);
    const raw = ordered.map((w) => w.text).join(" ").trim();
    used.push(...ordered);
    if (raw) cells[column.key] = { raw, value: parseCell(raw), confidence: Math.round(mean(ordered.map(wordConfidence))) };
  }
  return { cells, used };
}

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

type FlatHeader = { kind: "flat"; index: number; anchors: Anchor[] };
type GroupedHeader = { kind: "grouped"; index: number; groups: GroupAnchor[]; left: Anchor[]; right: Anchor[] };
type HeaderHit = FlatHeader | GroupedHeader;

// Collects EVERY header row on the page, in order: a grouped header (group labels) or a flat header
// (a row of column labels). A sheet with two teams has two of them, and each table runs until the
// next header.
function collectHeaders(rows: OcrWord[][], layout: ScoresheetLayout): HeaderHit[] {
  const hits: HeaderHit[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const grouped = groupedHeaderAt(rows, index, layout);
    if (grouped) {
      hits.push(grouped);
      continue;
    }
    const flat = findHeader([rows[index]], layout);
    if (flat) hits.push({ kind: "flat", index, anchors: flat.anchors });
  }
  return hits;
}

function groupedHeaderAt(rows: OcrWord[][], index: number, layout: ScoresheetLayout): GroupedHeader | null {
  if (!layout.groups || layout.groups.length === 0) return null;
  const row = rows[index];
  const found: { group: ScoresheetColumnGroup; x: number }[] = [];
  for (let i = 0; i < row.length; i += 1) {
    const one = normalizeText(row[i].text);
    const two = i + 1 < row.length ? normalizeText(`${row[i].text} ${row[i + 1].text}`) : "";
    const group = layout.groups.find((candidate) =>
      candidate.labels.some((label) => {
        const l = normalizeText(label);
        return one === l || two === l || one.startsWith(`${l} `) || two.startsWith(`${l} `);
      }),
    );
    if (group && !found.some((entry) => entry.group.key === group.key)) {
      found.push({ group, x: (row[i].x0 + row[i].x1) / 2 });
    }
  }
  if (found.length < 3) return null;

  const ordered = [...found].sort((a, b) => a.x - b.x);
  const firstLeft = (() => {
    const prev = null;
    void prev;
    return ordered[0].x;
  })();
  const lastX = ordered[ordered.length - 1].x;
  // Words on the same header row outside the group band are ordinary column labels (No, Name, Min
  // on the left; AS TO ST BS PF FD +/- EF PTS on the right) - they anchor those columns directly.
  const left: Anchor[] = [];
  const right: Anchor[] = [];
  for (const word of row) {
    const x = (word.x0 + word.x1) / 2;
    if (x >= firstLeft - 120 && x <= lastX + 160) continue;
    const column = columnForHeader(word.text, layout);
    if (!column) continue;
    const list = x < firstLeft ? left : right;
    if (!list.some((anchor) => anchor.column.key === column.key)) list.push({ column, x, index: list.length });
  }

  const groups = ordered.map((entry, position) => {
    const previous = position === 0 ? null : ordered[position - 1];
    const next = position === ordered.length - 1 ? null : ordered[position + 1];
    const leftEdge = previous ? (previous.x + entry.x) / 2 : entry.x - (next ? (next.x - entry.x) / 2 : 200);
    const rightEdge = next ? (entry.x + next.x) / 2 : entry.x + (entry.x - (previous?.x ?? entry.x - 400)) / 2;
    const columns = entry.group.columns.map((key) => (key ? layout.columns.find((c) => c.key === key) ?? null : null));
    return { columns, left: leftEdge, right: rightEdge > leftEdge ? rightEdge : leftEdge + 1 };
  });

  // The left labels (No, Name, Min) are sometimes OCR'd onto the row above or below the group row,
  // so look at the neighbouring rows too before giving up on them.
  for (const neighbour of [index - 1, index + 1]) {
    const row2 = rows[neighbour];
    if (!row2) continue;
    for (const word of row2) {
      const x = (word.x0 + word.x1) / 2;
      if (x >= firstLeft - 120 && x <= lastX + 160) continue;
      const column = columnForHeader(word.text, layout);
      if (!column) continue;
      const list = x < firstLeft ? left : right;
      if (!list.some((anchor) => anchor.column.key === column.key)) list.push({ column, x, index: list.length });
    }
  }
  return { kind: "grouped", index, groups, left, right };
}

function cellsForRow(row: OcrWord[], header: HeaderHit): { cells: Partial<Record<ScoresheetColumnKey, ExtractedCell>>; used: OcrWord[] } {
  if (header.kind === "flat") return rowCells(row, header.anchors);

  const firstLeft = header.groups[0].left;
  const lastRight = header.groups[header.groups.length - 1].right;
  const leftSide: OcrWord[] = [];
  const rightSide: OcrWord[] = [];
  const middle: OcrWord[] = [];
  for (const word of row) {
    const x = (word.x0 + word.x1) / 2;
    if (x < firstLeft) leftSide.push(word);
    else if (x >= lastRight) rightSide.push(word);
    else middle.push(word);
  }
  const middleCells = groupedCells(middle, header.groups);
  const cells = middleCells.cells;
  const used = [...middleCells.used];
  if (header.left.length > 0) {
    const sideCells = rowCells(leftSide, header.left);
    Object.assign(cells, sideCells.cells);
    used.push(...sideCells.used);
  }
  if (header.right.length > 0) {
    const sideCells = rowCells(rightSide, header.right);
    Object.assign(cells, sideCells.cells);
    used.push(...sideCells.used);
  }
  return { cells, used };
}

export function extractTeamTables(page: OcrPage, options: ExtractOptions): ExtractedTeamTable[] {
  const { layout } = options;
  const rows = groupIntoRows(page.words);
  const headers = collectHeaders(rows, layout);
  if (headers.length === 0) return [];

  const tables: ExtractedTeamTable[] = [];
  headers.forEach((header, headerIndex) => {
    const end = headerIndex + 1 < headers.length ? headers[headerIndex + 1].index : rows.length;
    const table: ExtractedTeamTable = {
      teamLabel: teamLabelBefore(rows, header.index),
      headerRowIndex: header.index,
      players: [],
      totals: {},
      confidence: 0,
      warnings: [],
    };
    for (let i = header.index + 1; i < end; i += 1) {
      const row = rows[i];
      if (row.length === 0) continue;
      if (isTotalsRow(row, layout)) {
        const { cells } = cellsForRow(row, header);
        applyPairs(cells, layout);
        table.totals = cells;
        continue;
      }
      const { cells, used } = cellsForRow(row, header);
      applyPairs(cells, layout);
      const jerseyCell = cells.jersey;
      const nameCell = cells.name;
      const jerseyNumber = jerseyCell?.value ?? (jerseyCell ? parseCell(jerseyCell.raw) : null);
      // A player row needs a name or a jersey number. On a grouped sheet OCR often loses the name
      // text but keeps the row's numbers, so a row with several numeric cells is kept as a nameless
      // player row (the reviewer fills the name in) rather than dropped - dropping it would silently
      // delete a player's whole stat line.
      const numericCells = Object.values(cells).filter((cell) => cell && cell.value !== null).length;
      const looksLikePlayerRow = Boolean(nameCell) || jerseyNumber !== null || numericCells >= 4;
      if (!looksLikePlayerRow) continue;
      if (!nameCell && jerseyNumber === null) table.warnings.push(`Row ${i + 1}: stats found but no player name or number - fill it in.`);
      const minutesRaw = cells.minutes?.raw ?? "";
      const rowText = normalizeText(row.map((w) => w.text).join(" "));
      const didNotPlay = layout.dnpMarkers.some((marker) => marker.length > 0 && (normalizeText(minutesRaw) === marker || rowText.endsWith(` ${marker}`)));
      table.players.push({
        rowIndex: i,
        jerseyNumber,
        name: nameCell?.raw ?? "",
        minutesRaw,
        didNotPlay,
        cells,
        confidence: Math.round(mean(used.map(wordConfidence))),
      });
      table.warnings.push(...rowWarnings(cells, i));
    }
    finishTable(table);
    if (table.players.length > 0 || Object.keys(table.totals).length > 0) tables.push(table);
  });
  return tables;
}

// The row immediately above a header usually carries the team name ("LEO KAREEM FOUNDATION (LFK)").
function teamLabelBefore(rows: OcrWord[][], headerIndex: number): string | null {
  for (let i = headerIndex - 1; i >= 0 && i >= headerIndex - 3; i -= 1) {
    const text = rows[i]?.map((word) => word.text).join(" ").trim() ?? "";
    if (text.length >= 3 && /[a-z]/i.test(text)) return text.slice(0, 120);
  }
  return null;
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
