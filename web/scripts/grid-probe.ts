// Evaluation for the grid detector (P15 I1 pivot, Prompt 1.2). Run it against a real sheet to see
// whether the printed table rules are actually separable from the text rows.
//
//   node --conditions=react-server --import tsx scripts/grid-probe.ts <image> [--json]
//
// Result on the only real scoresheets available (2026-10-18, Instagram screenshots of Genius FIBA
// exports at 720x1640): "horizontal rules are not evenly spaced" - a rule candidate every ~3px at both
// 720px and 3000px, i.e. the detector finds TEXT LINES. The screenshots have lost the table rules, so a
// per-cell crop cannot be built from them; a proper 300 DPI scan of a paper sheet is required.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { detectTableGrid, gridCells } from "../src/lib/ocr/grid";

async function main() {
  const file = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  const json = process.argv.includes("--json");
  if (!file) {
    console.error("Usage: node --conditions=react-server --import tsx scripts/grid-probe.ts <image> [--json]");
    process.exitCode = 1;
    return;
  }
  const original = readFileSync(file);
  const variants: { name: string; buffer: Buffer }[] = [{ name: "original", buffer: original }];
  variants.push({ name: "3x greyscale+median", buffer: await sharp(original).greyscale().resize({ width: 3000 }).median(1).sharpen({ sigma: 1.5 }).png().toBuffer() });

  const results = [];
  for (const variant of variants) {
    const { data, info } = await sharp(variant.buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    const grid = detectTableGrid({ data, width: info.width, height: info.height });
    results.push({ variant: variant.name, size: `${info.width}x${info.height}`, grid: grid.ok ? { ok: true, rowLines: grid.rowLines.length, colLines: grid.colLines.length, cells: gridCells(grid).length } : grid });
    if (!json) {
      console.log(`== ${variant.name} (${info.width}x${info.height})`);
      if (grid.ok) console.log(`   grid OK: ${grid.rowLines.length} row lines x ${grid.colLines.length} col lines = ${gridCells(grid).length} cells`);
      else console.log(`   grid REFUSED: ${grid.reason}`);
    }
  }
  if (json) console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
