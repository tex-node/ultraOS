import { readFileSync } from "node:fs";
import { parseBoxScoreCsv, csvToCorrected } from "../src/lib/scoresheet/csv-extract";
import { correctedTeamToTable } from "../src/lib/scoresheet/corrected";
import { buildChecksumReport } from "../src/lib/scoresheet/checksums";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createCsvScoresheetImport, approveScoresheetImport } from "../src/server/scoresheet/imports";

// Prompt 1 verification step: create a CSV import and approve it, then print the id for the ingest CLI.
const ORG = process.env.CSV_ORG ?? "cmucf1lo500003bkk1zyyoxmh";
const USER = process.env.CSV_USER ?? "cmqgct5pb000020kkm0aqtes2";
const path = process.argv[2];

async function main() {
  if (!path) throw new Error("usage: csv-e2e-step.ts <csv-path>");
  const text = readFileSync(path, "utf8");
  const parsed = parseBoxScoreCsv(text);
  const corrected = csvToCorrected(parsed, { sourceLabel: "CSV verification (scratch db)" });
  const checksums = buildChecksumReport({
    teams: [
      { table: correctedTeamToTable(corrected.home), label: corrected.home.clubName },
      { table: correctedTeamToTable(corrected.away), label: corrected.away.clubName },
    ],
    periods: corrected.periods,
    homeScore: corrected.homeScore,
    awayScore: corrected.awayScore,
  });
  const created = await withOrganizationContext(ORG, (tx) =>
    createCsvScoresheetImport(tx, { organizationId: ORG, userId: USER, sourceLabel: "CSV verification (scratch db)", parsed, corrected, checksums }),
  );
  console.log(`import id: ${created.id} · teams ${parsed.teams.length} · checks ${checksums.checks.length} failing ${checksums.checks.filter((check) => !check.ok).length}`);
  const approved = await withOrganizationContext(ORG, (tx) =>
    approveScoresheetImport(tx, {
      organizationId: ORG,
      importId: created.id,
      userId: USER,
      corrected: { ...corrected, approvedAt: new Date().toISOString(), approvedById: USER },
      checksums,
    }),
  );
  console.log(`approve: ${JSON.stringify(approved)}`);
  console.log(`IMPORT_ID=${created.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
