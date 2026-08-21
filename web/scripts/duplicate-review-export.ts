import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { duplicateReviewExports } from "../src/lib/data-quality";
import { prisma } from "../src/lib/prisma";

const outDir = process.env.REPORT_DIR ?? path.join(process.cwd(), "reports");

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { csv, safeJson, markdown } = await duplicateReviewExports();
  writeFileSync(path.join(outDir, "duplicate-review.csv"), csv);
  writeFileSync(path.join(outDir, "duplicate-review-safe.json"), JSON.stringify(safeJson, null, 2));
  writeFileSync(path.join(outDir, "duplicate-resolution-summary.md"), markdown);
  console.log(JSON.stringify({ outDir, files: ["duplicate-review.csv", "duplicate-review-safe.json", "duplicate-resolution-summary.md"], groups: safeJson.groups.length }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
