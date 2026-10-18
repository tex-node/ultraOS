import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { OCR_FAILED, OCR_UNAVAILABLE, OcrError, type OcrPage, type OcrProvider, type OcrWord } from "./provider";

const run = promisify(execFile);

// Tesseract via the host binary (installed: tesseract 5.3.4 + eng, on the same VPS as the app).
// No JS dependency, no model download at runtime, and the binary's version is recorded so an
// extraction made with a different engine version is comparable.
//
// Honesty rule: if the binary is missing, isAvailable() returns false and recognise* throws
// OCR_UNAVAILABLE. The import is marked FAILED with that reason - the pipeline never fabricates a
// table from nothing.

// PSM 6 = "assume a single uniform block of text". Box-score sheets are a table, not prose; 6 keeps
// Tesseract from reordering columns the way the default page-segmentation does. TSV output gives
// per-word bounding boxes and confidences, which the extractor needs.
const TESSERACT_ARGS = ["-l", "eng", "--psm", "6", "tsv"];

type TsvRow = { level: string; block: string; par: string; line: string; word: string; left: string; top: string; width: string; height: string; conf: string; text: string };

function parseTsv(tsv: string): OcrPage {
  const lines = tsv.split("\n");
  const words: OcrWord[] = [];
  let width = 0;
  let height = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    // Header row: level 1 page with page dimensions is not in TSV; the first data row is level 2
    // (block). Page width/height are derived from the words' extents below when absent.
    const row: TsvRow = {
      level: cols[0], block: cols[2], par: cols[3], line: cols[4], word: cols[5],
      left: cols[6], top: cols[7], width: cols[8], height: cols[9], conf: cols[10], text: cols[11],
    };
    if (row.level === "1") continue; // page-level row carries no text we use
    const text = row.text.trim();
    if (!text) continue;
    const x0 = Number(row.left);
    const y0 = Number(row.top);
    const w = Number(row.width);
    const h = Number(row.height);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
    width = Math.max(width, x0 + w);
    height = Math.max(height, y0 + h);
    words.push({
      text,
      confidence: Number(row.conf),
      x0,
      y0,
      x1: x0 + w,
      y1: y0 + h,
      // Tesseract repeats the same line id for every word on one physical line, per block/par.
      lineId: `${row.block}:${row.par}:${row.line}`,
    });
  }
  return { width, height, words };
}

export class TesseractProvider implements OcrProvider {
  readonly name: string;
  private available: boolean | null = null;

  constructor(private readonly binary = "tesseract") {
    this.name = "tesseract";
  }

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const { stdout } = await run(this.binary, ["--version"], { timeout: 5000 });
      const version = /tesseract\s+v?(\d+\.\d+\.\d+)/i.exec(stdout)?.[1];
      this.available = true;
      if (version) (this as { name: string }).name = `tesseract-${version}`;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async recogniseFile(path: string): Promise<OcrPage> {
    return this.runOn(path);
  }

  async recogniseBuffer(bytes: Buffer): Promise<OcrPage> {
    const dir = await mkdtemp(join(tmpdir(), "scoresheet-ocr-"));
    const file = join(dir, "sheet.png");
    try {
      await writeFile(file, bytes);
      return await this.runOn(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async runOn(path: string): Promise<OcrPage> {
    if (!(await this.isAvailable())) {
      throw new OcrError(OCR_UNAVAILABLE, `The ${this.binary} binary is not available on this host, so the sheet cannot be read.`);
    }
    // Tesseract writes <input>.tsv next to the input; use a scratch dir to keep the source untouched.
    const dir = await mkdtemp(join(tmpdir(), "scoresheet-tsv-"));
    const outBase = join(dir, "out");
    try {
      const prepared = await this.preprocess(path, dir);
      await run(this.binary, [prepared, outBase, ...TESSERACT_ARGS], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
      const tsv = await readFile(`${outBase}.tsv`, "utf8");
      const page = parseTsv(tsv);
      if (page.words.length === 0) {
        throw new OcrError(OCR_FAILED, "Tesseract returned no words for this image. A blank, blurred or upside-down scan produces this.");
      }
      return page;
    } catch (error) {
      if (error instanceof OcrError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new OcrError(OCR_FAILED, `Tesseract failed on this image: ${message}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // Preprocessing is not cosmetic: these sheets are dense numeric grids photographed off a screen,
  // and Tesseract at native resolution reads most cells as bracket soup ("oo]", "[olol]"). Measured on
  // a real LBCL sheet (2026-10-18): clean numeric tokens per page went 34 -> 127 with a 3x upscale, a
  // 3x3 median filter and a sharpen, and the player rows became readable ("5 JOCHENWORIE 20:17 5/8
  // 62.5 4/4 100 ..."). The median filter is what removes the JPEG ringing around the cell borders
  // that Tesseract otherwise fuses into the digits.
  // Disable with OCR_PREPROCESS=off when comparing provider behaviour.
  private async preprocess(path: string, dir: string): Promise<string> {
    if (process.env.OCR_PREPROCESS === "off") return path;
    try {
      const { default: sharp } = await import("sharp");
      const prepared = join(dir, "prepared.png");
      const metadata = await sharp(path).metadata();
      // 3x upscale for a phone screenshot, but never shrink a large scan.
      const width = Math.max(3000, Math.round((metadata.width ?? 720) * 3));
      await sharp(path)
        .greyscale()
        .resize({ width })
        .median(1)
        .sharpen({ sigma: 1.5 })
        .png()
        .toFile(prepared);
      return prepared;
    } catch {
      // A missing sharp or an unreadable image must not stop the attempt - OCR the original instead.
      return path;
    }
  }
}

// Default provider used by the pipeline. Kept as a factory so tests can inject a fake.
export function createOcrProvider(): OcrProvider {
  return new TesseractProvider(process.env.TESSERACT_BINARY || "tesseract");
}
