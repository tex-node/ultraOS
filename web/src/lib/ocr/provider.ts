import "server-only";

// OCR provider seam (P15 I1). The extraction pipeline (src/lib/scoresheet/extract.ts) works on a
// normalised OcrPage, never on a provider's own output shape, so a second engine (a cloud API, a
// different local binary) can be added without touching extraction, checksums or review.
//
// v1 ships one provider - Tesseract via the host binary - because it needs no JS model files
// (tesseract.js ships ~15 MB of wasm + traineddata) and this host already runs the app. See
// TesseractProvider.isAvailable() for the honest "not installed" path: the pipeline reports
// OCR_UNAVAILABLE rather than pretending it read the sheet.

export type OcrWord = {
  text: string;
  /** 0-100, Tesseract's own confidence for the word. */
  confidence: number;
  /** Pixel coordinates on the page. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Tesseract's block/paragraph/line grouping, used to keep a row's cells together. */
  lineId: string;
};

export type OcrPage = {
  width: number;
  height: number;
  words: OcrWord[];
};

export interface OcrProvider {
  /** Stable id recorded on the import ("tesseract-5.3.4"), so a re-run is comparable. */
  readonly name: string;
  /** True when this host can actually run the engine. Never throws. */
  isAvailable(): Promise<boolean>;
  /** Recognise an image file already on disk (MediaAsset storage gives us a path, not bytes). */
  recogniseFile(path: string): Promise<OcrPage>;
  /** Recognise in-memory bytes (used by tests and by any future upload path). */
  recogniseBuffer(bytes: Buffer): Promise<OcrPage>;
}

export const OCR_UNAVAILABLE = "OCR_UNAVAILABLE";
export const OCR_FAILED = "OCR_FAILED";

export class OcrError extends Error {
  constructor(
    public readonly code: typeof OCR_UNAVAILABLE | typeof OCR_FAILED,
    message: string,
  ) {
    super(message);
    this.name = "OcrError";
  }
}

// Row grouping lives in ./rows.ts so the pure extraction module does not have to import this
// file (which spawns processes) just to get it.
export { groupIntoRows } from "./rows";
