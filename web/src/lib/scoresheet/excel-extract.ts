import * as XLSX from "xlsx";
import { parseBoxScoreMatrix, type ParsedCsvScoresheet } from "./csv-extract";

// Prompt 2 (streak v4): .xlsx support that is not a second parser.
//
// The workbook's first sheet becomes the exact string matrix a CSV produces (row-major, every cell a
// string, blank cells ""), and `parseBoxScoreMatrix` does the rest - metadata lines, `## TEAM` sections,
// header aliases, made-attempted pairs, checksums. So a workbook and a CSV of the same game produce the
// SAME ParsedCsvScoresheet, and there is only one place where the table is interpreted.
//
// SheetJS is used with `cellDates: false` and `raw: false` so a date cell renders as its display string
// and a number cell as "5" rather than 5 - the parser is string-based, and a numeric 0 must not become
// "" or false.

export type ExcelSheetSummary = { sheetName: string; sheetCount: number; rowCount: number; columnCount: number };

export function xlsxToMatrix(bytes: Uint8Array | ArrayBuffer): { matrix: string[][]; summary: ExcelSheetSummary } {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false, cellStyles: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`The workbook's first sheet ("${sheetName}") could not be read.`);

  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    // `raw: false` renders formatted text (percentages, dates); dateNF keeps ISO-ish dates readable.
    dateNF: 'yyyy-mm-dd"T"hh:mm:ss',
  });

  const matrix = rows.map((row) => (Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())) : []));
  const columnCount = matrix.reduce((widest, row) => Math.max(widest, row.length), 0);
  // Pad every row to the widest one so column indexes stay stable across rows (a spreadsheet omits
  // trailing empty cells, which would otherwise shift a row's last values into the wrong columns).
  const padded = matrix.map((row) => (row.length === columnCount ? row : [...row, ...new Array<string>(columnCount - row.length).fill("")]));

  return {
    matrix: padded,
    summary: { sheetName, sheetCount: workbook.SheetNames.length, rowCount: padded.length, columnCount },
  };
}

export function parseBoxScoreXlsx(bytes: Uint8Array | ArrayBuffer): { parsed: ParsedCsvScoresheet; summary: ExcelSheetSummary } {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Refuse a mislabelled file up front: SheetJS happily reads plain text as a one-column text sheet, and
  // the resulting "no player-name column" error would send the operator looking in the wrong place.
  if (!looksLikeXlsx(buffer)) {
    throw new Error("This file is not an .xlsx workbook (it does not look like a zip container). Upload the .xlsx or paste it as .csv.");
  }
  const { matrix, summary } = xlsxToMatrix(buffer);
  if (matrix.length === 0) throw new Error("The workbook's first sheet is empty.");
  return { parsed: parseBoxScoreMatrix(matrix), summary };
}

/** True when the bytes look like a zip container (xlsx is a zip). Used to reject a mislabelled file. */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}
