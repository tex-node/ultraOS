// External stats ingestion CLI (2026-09-22). Reads a JSON file describing one tournament's
// worth of box-score games (transcribed from photographed/PDF FIBA-style sheets) and loads them
// via src/lib/external-stats-ingestion.ts. Dry-run by default; pass --apply to write.
//
// Usage:
//   npx tsx scripts/external-stats-ingest.ts <path-to-batch.json>            (dry run)
//   npx tsx scripts/external-stats-ingest.ts <path-to-batch.json> --apply    (writes)
//
// The batch JSON's top-level "organization" field decides new-vs-existing (this is the
// "ask if the tournament should be created or add to an existing tournament" decision -
// made explicit and reviewable in the file rather than an interactive prompt, since a batch
// like this is transcribed once and then run non-interactively):
//   { "organization": { "mode": "new", "name": "...", "slug": "...", "idPrefixAthlete": "...", "idPrefixStaff": "..." }, "games": [...] }
//   { "organization": { "mode": "existing", "organizationId": "..." }, "games": [...] }
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { ingestBoxScoreGame, type IngestBoxScoreInput, type NewOrganizationInput } from "../src/lib/external-stats-ingestion";

type BatchOrganization = { mode: "new"; organization: NewOrganizationInput } | { mode: "existing"; organizationId: string };
type Batch = { organization: BatchOrganization; actorId: string; games: IngestBoxScoreInput[] };

async function main() {
  const [batchPath, flag] = process.argv.slice(2);
  if (!batchPath) {
    console.error("Usage: npx tsx scripts/external-stats-ingest.ts <batch.json> [--apply]");
    process.exitCode = 1;
    return;
  }
  const apply = flag === "--apply";
  const batch = JSON.parse(readFileSync(batchPath, "utf8")) as Batch;

  console.log(`Organization: ${batch.organization.mode === "new" ? `NEW "${batch.organization.organization.name}" (slug ${batch.organization.organization.slug})` : `existing ${batch.organization.organizationId}`}`);
  console.log(`Games in batch: ${batch.games.length}`);
  console.log(apply ? "Mode: APPLY (will write)" : "Mode: DRY RUN (no writes - pass --apply to write)");
  console.log("");

  const results: unknown[] = [];
  for (const game of batch.games) {
    const label = `${game.home.clubName} vs ${game.away.clubName} (${game.scheduledAt})`;
    try {
      const result = await ingestBoxScoreGame(batch.organization, game, batch.actorId, { dryRun: !apply });
      console.log(`${apply ? "IMPORTED" : "DRY-RUN OK"}: ${label}`);
      if (apply && "import" in result) {
        console.log(`  fixture=${result.fixtureId} (${result.fixtureCreated ? "new" : "existing"}) status=${result.import.status} players_created=${result.playersCreated}`);
        if (result.import.status === "BLOCKED") console.log(`  BLOCKED: ${result.import.reason}`);
      }
      results.push(result);
    } catch (error) {
      console.error(`FAILED: ${label}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }

  console.log("\nDone.");
}

main().finally(() => prisma.$disconnect());
