// P15 I1 pivot: table-grid detection, as a building block for "crop each cell, then OCR it".
//
// WHY THIS IS NOT WIRED INTO THE DEFAULT PIPELINE: measured on the only real scoresheets available
// (Instagram screenshots of Genius FIBA exports, 720x1640), the printed table rules are NOT separable
// from the text rows - a brightness-profile pass finds a "rule" every 3px at 720px AND at 3000px
// (upscaled), i.e. it finds the text lines, not the grid. A per-cell crop built on that grid would cut
// through glyphs. On a proper 300 DPI scan of a paper sheet the rules are one clean dark line and this
// works, so the detector is shipped, tested against a synthetic table (where the rules ARE clean), and
// documented as "requires a scan, not a screenshot" rather than silently degrading the pipeline.
//
// The evaluation that produced that conclusion lives in scripts/grid-probe.ts.

export type PixelBuffer = { data: Uint8Array; width: number; height: number };

export type GridRect = { x: number; y: number; width: number; height: number };

export type TableGrid =
  | { ok: true; left: number; right: number; top: number; bottom: number; rowLines: number[]; colLines: number[] }
  | { ok: false; reason: string };

export type DetectOptions = {
  /** A pixel darker than this is "ink" when locating the page. */
  lightThreshold?: number;
  /** How much darker than the row/column median a rule line must be. */
  ruleDelta?: number;
  /** Minimum lines for something to count as a table. */
  minRowLines?: number;
  minColLines?: number;
  /** Gap regularity: coefficient of variation above this means "not a table". */
  maxGapVariation?: number;
};

const defaults = { lightThreshold: 170, ruleDelta: 18, minRowLines: 4, minColLines: 6, maxGapVariation: 0.35 };

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mergeRuns(values: number[], tolerance = 2): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (out.length === 0 || value - out[out.length - 1] > tolerance) out.push(value);
  }
  return out;
}

function gapVariation(lines: number[]): number {
  const gaps = lines.slice(1).map((line, index) => line - lines[index]).filter((gap) => gap > 0);
  if (gaps.length < 2) return Number.POSITIVE_INFINITY;
  const average = mean(gaps);
  if (average <= 0) return Number.POSITIVE_INFINITY;
  const variance = mean(gaps.map((gap) => (gap - average) ** 2));
  return Math.sqrt(variance) / average;
}

/**
 * Finds the page's light region, then the horizontal and vertical rule lines inside it.
 *
 * Returns `{ ok: false, reason }` rather than a guessed grid: a caller that cuts cells from a wrong
 * grid produces garbage that looks legitimate, which is worse than a FAILED import.
 */
export function detectTableGrid(pixels: PixelBuffer, options: DetectOptions = {}): TableGrid {
  const { lightThreshold, ruleDelta, minRowLines, minColLines, maxGapVariation } = { ...defaults, ...options };
  const { data, width, height } = pixels;
  if (width < 60 || height < 60) return { ok: false, reason: `image is only ${width}x${height}` };
  const at = (x: number, y: number) => data[y * width + x];

  // 1. The page: rows whose mean brightness is clearly "paper".
  const rowMeans: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) sum += at(x, y);
    rowMeans.push(sum / width);
  }
  const lightRows = rowMeans.map((value, y) => ({ y, value })).filter((row) => row.value > lightThreshold);
  if (lightRows.length < height * 0.05) return { ok: false, reason: "no light page region (is this a dark screenshot?)" };
  const top = lightRows[0].y;
  const bottom = lightRows[lightRows.length - 1].y;

  // 2. The page's horizontal extent, measured only inside that band (dark chrome above/below would
  // otherwise pull every column below the threshold).
  const colMeans: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = top; y <= bottom; y += 1) sum += at(x, y);
    colMeans.push(sum / (bottom - top + 1));
  }
  const lightCols = colMeans.map((value, x) => ({ x, value })).filter((col) => col.value > lightThreshold);
  if (lightCols.length < 20) return { ok: false, reason: "no light page region horizontally" };
  const left = lightCols[0].x;
  const right = lightCols[lightCols.length - 1].x;

  // 3. Rule lines: rows/columns noticeably darker than the region's median.
  const rowProfile: number[] = [];
  for (let y = top; y <= bottom; y += 1) {
    let sum = 0;
    for (let x = left + 4; x <= right - 4; x += 1) sum += at(x, y);
    rowProfile.push(sum / Math.max(1, right - left - 8));
  }
  const colProfile: number[] = [];
  for (let x = left; x <= right; x += 1) {
    let sum = 0;
    for (let y = top + 4; y <= bottom - 4; y += 1) sum += at(x, y);
    colProfile.push(sum / Math.max(1, bottom - top - 8));
  }
  const rowThreshold = median(rowProfile) - ruleDelta;
  const colThreshold = median(colProfile) - ruleDelta;
  const rowLines = mergeRuns(rowProfile.map((value, index) => (value < rowThreshold ? top + index : -1)).filter((value) => value >= 0));
  const colLines = mergeRuns(colProfile.map((value, index) => (value < colThreshold ? left + index : -1)).filter((value) => value >= 0));

  if (rowLines.length < minRowLines) return { ok: false, reason: `only ${rowLines.length} horizontal rules (need ${minRowLines})` };
  if (colLines.length < minColLines) return { ok: false, reason: `only ${colLines.length} vertical rules (need ${minColLines})` };
  const rowVariation = gapVariation(rowLines);
  const colVariation = gapVariation(colLines);
  if (rowVariation > maxGapVariation) {
    return { ok: false, reason: `horizontal rules are not evenly spaced (variation ${rowVariation.toFixed(2)}) - probably text lines, not a grid` };
  }
  if (colVariation > maxGapVariation) {
    return { ok: false, reason: `vertical rules are not evenly spaced (variation ${colVariation.toFixed(2)}) - probably glyphs, not a grid` };
  }
  return { ok: true, left, right, top, bottom, rowLines, colLines };
}

/** The cell rectangles of a grid, row-major. The outermost lines are the table's border, so a table
 *  with R row lines and C column lines has (R-1) x (C-1) cells. */
export function gridCells(grid: Extract<TableGrid, { ok: true }>): GridRect[] {
  const cells: GridRect[] = [];
  for (let row = 0; row < grid.rowLines.length - 1; row += 1) {
    for (let col = 0; col < grid.colLines.length - 1; col += 1) {
      cells.push({
        x: grid.colLines[col],
        y: grid.rowLines[row],
        width: grid.colLines[col + 1] - grid.colLines[col],
        height: grid.rowLines[row + 1] - grid.rowLines[row],
      });
    }
  }
  return cells;
}
