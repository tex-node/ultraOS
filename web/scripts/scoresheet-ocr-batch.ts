// Acceptance harness for I1 (OCR scoresheet ingestion). Runs the real provider over a directory of
// sheet images and reports, per sheet, what the pipeline actually got: whether a header was found,
// how many player rows, the mean confidence, the checksum pass/fail against the sheet's own printed
// totals, and how long OCR took. Nothing here writes to the database - it is the measurement step
// that produces documentation/OCR_SCORESHEET_INGESTION.md.
//
// Usage:
//   node --conditions=react-server --import tsx scripts/scoresheet-ocr-batch.ts <dir> [--json] [--limit N]
//
// `--conditions=react-server` is required because the provider chain imports "server-only" (the same
// requirement the DB test suite has).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { TesseractProvider } from "../src/lib/ocr/tesseract";
import { extractScoresheet } from "../src/lib/scoresheet/extract";
import { buildChecksumReport } from "../src/lib/scoresheet/checksums";
import { LBCL_LAYOUT } from "../src/lib/scoresheet/templates";

type SheetResult = {
  file: string;
  ok: boolean;
  error?: string;
  teams: number;
  players: number;
  confidence: number;
  warnings: number;
  checks: { total: number; failed: number };
  ms: number;
};

async function main() {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--limit");
  const json = argv.includes("--json");
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Number.POSITIVE_INFINITY;
  if (!dir) {
    console.error("Usage: node --conditions=react-server --import tsx scripts/scoresheet-ocr-batch.ts <dir> [--json] [--limit N]");
    process.exitCode = 1;
    return;
  }
  const files = readdirSync(dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort()
    .slice(0, Number.isFinite(limit) ? limit : undefined);
  const provider = new TesseractProvider(process.env.TESSERACT_BINARY || "tesseract");
  if (!(await provider.isAvailable())) {
    console.error("tesseract is not available on this host");
    process.exitCode = 1;
    return;
  }
  console.log(`provider: ${provider.name} · layout: ${LBCL_LAYOUT.key} · sheets: ${files.length}`);

  const results: SheetResult[] = [];
  for (const file of files) {
    const started = Date.now();
    try {
      const page = await provider.recogniseFile(join(dir, file));
      const extraction = extractScoresheet([page], { layout: LBCL_LAYOUT, version: `${provider.name}-${LBCL_LAYOUT.key}-1` });
      const tables = extraction.teams;
      const players = tables.reduce((total, table) => total + table.players.length, 0);
      const confidence = tables.length > 0 ? Math.round(tables.reduce((total, table) => total + table.confidence, 0) / tables.length) : 0;
      const checks = buildChecksumReport({ teams: tables.map((table, index) => ({ table, label: `team-${index + 1}` })) });
      const failed = checks.checks.filter((check) => !check.ok).length;
      results.push({
        file,
        ok: tables.length > 0,
        teams: tables.length,
        players,
        confidence,
        warnings: extraction.warnings.length + tables.reduce((total, table) => total + table.warnings.length, 0),
        checks: { total: checks.checks.length, failed },
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({ file, ok: false, error: error instanceof Error ? error.message : String(error), teams: 0, players: 0, confidence: 0, warnings: 0, checks: { total: 0, failed: 0 }, ms: Date.now() - started });
    }
    const last = results[results.length - 1];
    console.log(
      `${last.ok ? "READ " : "FAIL "} ${file.padEnd(28)} teams=${last.teams} players=${String(last.players).padStart(2)} conf=${String(last.confidence).padStart(3)} checks=${last.checks.total - last.checks.failed}/${last.checks.total} warn=${last.warnings} ${last.ms}ms${last.error ? `  ${last.error}` : ""}`,
    );
  }

  const read = results.filter((r) => r.ok);
  const summary = {
    sheets: results.length,
    read: read.length,
    playersTotal: read.reduce((total, r) => total + r.players, 0),
    meanConfidence: read.length > 0 ? Math.round(read.reduce((total, r) => total + r.confidence, 0) / read.length) : 0,
    sheetsWithFailingChecks: read.filter((r) => r.checks.failed > 0).length,
    meanMs: results.length > 0 ? Math.round(results.reduce((total, r) => total + r.ms, 0) / results.length) : 0,
    failedToRead: results.filter((r) => !r.ok).map((r) => r.file),
  };
  console.log("");
  console.log(JSON.stringify({ summary, results }, null, json ? 2 : 0));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
