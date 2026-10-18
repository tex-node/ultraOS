import type { OcrWord } from "./provider";

// Pure row-building helpers for OCR output (no server-only, no child_process), so the extraction
// module and its tests can use them without pulling in the OCR provider's spawn machinery.

// Words sorted into visual rows: group by the midpoint y (Tesseract sometimes splits one physical
// row across two line ids), then left-to-right within the row. Extraction depends on this more than
// on any single word being read correctly.
export function groupIntoRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let currentY = Number.NaN;
  for (const word of sorted) {
    const midY = (word.y0 + word.y1) / 2;
    const height = Math.max(1, word.y1 - word.y0);
    if (current.length === 0 || Math.abs(midY - currentY) <= height * 0.6) {
      current.push(word);
      currentY = current.length === 1 ? midY : (currentY * (current.length - 1) + midY) / current.length;
    } else {
      rows.push(current);
      current = [word];
      currentY = midY;
    }
  }
  if (current.length > 0) rows.push(current);
  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}
