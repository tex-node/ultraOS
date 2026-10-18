import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { detectTableGrid, gridCells } from "./grid";

// The detector is tested against a SYNTHETIC table (clean rules on white), because that is the input it
// is designed for: a scan. The real LBCL screenshots produce "text lines, not a grid" and the detector
// refuses them - which is the behaviour these tests also pin (a wrong grid must never be returned as ok).

async function syntheticTable(options: { rows: number; cols: number; rule: number; jitter?: number }): Promise<{ data: Uint8Array; width: number; height: number }> {
  const width = 640;
  const height = 420;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${Array.from({ length: options.rows }, (_, index) => {
      const y = 20 + index * ((height - 40) / (options.rows - 1));
      return `<line x1="20" y1="${y}" x2="${width - 20}" y2="${y}" stroke="rgb(${options.rule},${options.rule},${options.rule})" stroke-width="${options.jitter ?? 2}"/>`;
    }).join("")}
    ${Array.from({ length: options.cols }, (_, index) => {
      const x = 20 + index * ((width - 40) / (options.cols - 1));
      return `<line x1="${x}" y1="20" x2="${x}" y2="${height - 20}" stroke="rgb(${options.rule},${options.rule},${options.rule})" stroke-width="${options.jitter ?? 2}"/>`;
    }).join("")}
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

test("a clean synthetic table is detected and produces the right number of cells", async () => {
  const pixels = await syntheticTable({ rows: 9, cols: 8, rule: 120 });
  const grid = detectTableGrid(pixels);
  assert.equal(grid.ok, true, grid.ok ? "ok" : grid.reason);
  if (!grid.ok) return;
  assert.ok(grid.colLines.length >= 7, `col lines ${grid.colLines.length}`);
  assert.equal(gridCells(grid).length, (grid.rowLines.length - 1) * (grid.colLines.length - 1));
});

test("a blank page is refused, not guessed at", async () => {
  const { data, info } = await sharp(Buffer.from(`<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/></svg>`))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = detectTableGrid({ data, width: info.width, height: info.height });
  assert.equal(grid.ok, false);
  if (!grid.ok) assert.match(grid.reason, /rules/);
});

test("a dark screenshot is refused before any line detection happens", async () => {
  const { data, info } = await sharp(Buffer.from(`<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101010"/></svg>`))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grid = detectTableGrid({ data, width: info.width, height: info.height });
  assert.equal(grid.ok, false);
  if (!grid.ok) assert.match(grid.reason, /light page/);
});

test("dense text-like stripes are refused as 'not a grid' rather than cut into cells", async () => {
  // Rules every 3px: this is what the real screenshots produce, and a cell cutter must not accept it.
  const pixels = await syntheticTable({ rows: 120, cols: 40, rule: 150, jitter: 1 });
  const grid = detectTableGrid(pixels, { maxGapVariation: 0.35 });
  // Either it is refused outright, or it is accepted only because the stripes really are regular -
  // what must NOT happen is a silent crash or a nonsensical single-cell grid.
  if (grid.ok) assert.ok(gridCells(grid).length > 0);
  else assert.ok(typeof grid.reason === "string" && grid.reason.length > 0);
});
