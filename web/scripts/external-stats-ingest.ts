// External stats ingestion CLI (2026-09-22). Reads a JSON file describing one tournament's
// worth of box-score games (transcribed from photographed/PDF FIBA-style sheets) and loads them
// via src/lib/external-stats-ingestion.ts. Dry-run by default; pass --apply to write.
//
// Usage:
//   npx tsx scripts/external-stats-ingest.ts <path-to-batch.json>            (dry run)
//   npx tsx scripts/external-stats-ingest.ts <path-to-batch.json> --apply    (writes)
//
// I1 (OCR scoresheet ingestion): a sheet that went through OCR -> human review can be ingested
// straight from its import row, so the reviewed numbers reach the SAME pipeline as a hand-typed
// batch (there is no second ingestion path):
//   npx tsx scripts/external-stats-ingest.ts --scoresheetImportId <id> [--apply] [--gender MALE|FEMALE]
// The import must be APPROVED. The acting user defaults to the reviewer; --actor overrides it.
//
// The batch JSON's top-level "organization" field decides new-vs-existing (this is the
// "ask if the tournament should be created or add to an existing tournament" decision -
// made explicit and reviewable in the file rather than an interactive prompt, since a batch
// like this is transcribed once and then run non-interactively):
//   { "organization": { "mode": "new", "name": "...", "slug": "...", "idPrefixAthlete": "...", "idPrefixStaff": "..." }, "games": [...] }
//   { "organization": { "mode": "existing", "organizationId": "..." }, "games": [...] }
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { ingestBoxScoreGame, type IngestBoxScoreInput, type NewOrganizationInput } from "../src/lib/external-stats-ingestion";
import type { CorrectedScoresheet } from "../src/server/scoresheet/imports";

type BatchOrganization = { mode: "new"; organization: NewOrganizationInput } | { mode: "existing"; organizationId: string };
type Batch = { organization: BatchOrganization; actorId: string; games: IngestBoxScoreInput[] };

// Builds the same IngestBoxScoreInput a batch file carries, from an approved scoresheet import.
// Competition/division/season/venue are resolved from the organization's own season, because a
// historical sheet does not carry them and the pipeline needs real ids to attach the game to.
async function ingestApprovedScoresheet(args: { importId: string; apply: boolean; gender: "MALE" | "FEMALE"; actorId?: string }) {
  const row = await prisma.scoresheetImport.findFirst({
    where: { id: args.importId },
    select: { id: true, organizationId: true, status: true, corrected: true, reviewedById: true, sourceLabel: true },
  });
  if (!row) throw new Error(`scoresheet import ${args.importId} not found`);
  if (row.status !== "APPROVED") throw new Error(`import is ${row.status}, not APPROVED - approve it in the review queue first`);
  const corrected = row.corrected as unknown as CorrectedScoresheet | null;
  if (!corrected) throw new Error("this import has no approved corrected data");
  const actorId = args.actorId ?? row.reviewedById;
  if (!actorId) throw new Error("no acting user: pass --actor <userId> (the import has no reviewer recorded)");

  const orgId = row.organizationId;
  const season = await withOrganizationContext(orgId, (tx) =>
    tx.season.findFirst({
      where: { organizationId: orgId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true, competition: { select: { name: true, slug: true, sport: { select: { slug: true } }, divisions: { select: { name: true, slug: true }, take: 1 } } } },
    }),
  );
  if (!season?.competition) throw new Error("the organization has no season/competition to ingest into");
  const division = season.competition.divisions[0];
  if (!division) throw new Error("the organization's competition has no division to attach the game to");

  const mapTeam = (team: CorrectedScoresheet["home"], clubName: string) => ({
    clubName,
    clubShortName: clubName.slice(0, 4).toUpperCase(),
    totals: { points: team.totals.points, rebounds: team.totals.rebounds, assists: team.totals.assists, turnovers: team.totals.turnovers, fouls: team.totals.fouls },
    advanced: {
      pointsFromTurnovers: 0,
      pointsInPaint: 0,
      pointsInPaintMade: 0,
      pointsInPaintAttempted: 0,
      secondChancePoints: 0,
      fastBreakPoints: 0,
      fastBreakPointsFromTurnovers: 0,
      benchPoints: 0,
      biggestLead: 0,
      biggestScoringRun: 0,
      // Not printed on the sheets this project transcribes; the import type has no null, so 0.
      pointsPerPossession: 0,
      leadChanges: 0,
      timesTied: 0,
      timeWithLeadSeconds: 0,
    },
    players: team.players
      .filter((p) => p.name.trim().length > 0)
      .map((p) => ({
        fullName: p.name,
        reportedName: p.name,
        jerseyNumber: p.jerseyNumber,
        didNotPlay: p.didNotPlay,
        minutesPlayed: p.minutesPlayed,
        points: p.points,
        fieldGoalsMade: p.fgm,
        fieldGoalsAttempted: p.fga,
        twoPointsMade: p.fg2m,
        twoPointsAttempted: p.fg2a,
        threePointsMade: p.fg3m,
        threePointsAttempted: p.fg3a,
        freeThrowsMade: p.ftm,
        freeThrowsAttempted: p.fta,
        offensiveRebounds: p.oreb,
        defensiveRebounds: p.dreb,
        assists: p.assists,
        turnovers: p.turnovers,
        steals: p.steals,
        blocks: p.blocks,
        foulsCommitted: p.fouls,
        foulsDrawn: 0,
        plusMinus: 0,
        efficiency: 0,
      })),
  });

  const input: IngestBoxScoreInput = {
    tournament: { name: season.competition.name, slug: season.competition.slug, sportSlug: season.competition.sport.slug },
    division: { name: division.name, slug: division.slug },
    season: { name: season.name, startDate: season.startDate.toISOString(), endDate: season.endDate.toISOString() },
    venue: { name: "Venue TBC (unspecified in source sheet)", address: "Lagos, Nigeria", city: "Lagos", capacity: 300 },
    scheduledAt: new Date(corrected.scheduledAt).toISOString(),
    home: mapTeam(corrected.home, corrected.home.clubName),
    away: mapTeam(corrected.away, corrected.away.clubName),
    homeScore: corrected.homeScore,
    awayScore: corrected.awayScore,
    periods: corrected.periods.map((p, index) => ({ period: index + 1, label: p.label, homeScore: p.homeScore, awayScore: p.awayScore })),
    sourceLabel: row.sourceLabel,
    playerGender: args.gender,
  };

  console.log(`Scoresheet import ${row.id} (${row.status}) -> ${corrected.home.clubName} vs ${corrected.away.clubName} on ${corrected.scheduledAt}`);
  console.log(args.apply ? "Mode: APPLY (will write)" : "Mode: DRY RUN (no writes - pass --apply to write)");
  const result = await ingestBoxScoreGame({ mode: "existing", organizationId: orgId }, input, actorId, { dryRun: !args.apply });
  if (!args.apply) {
    console.log("DRY-RUN OK: the approved sheet maps cleanly onto the ingestion input.");
    return;
  }
  if (!("import" in result)) throw new Error("ingestion returned no import report");
  console.log(`IMPORTED: fixture=${result.fixtureId} status=${result.import.status} players_created=${result.playersCreated}`);
  if (result.import.status === "BLOCKED") {
    console.log(`BLOCKED: ${result.import.reason}`);
    process.exitCode = 1;
    return;
  }
  await withOrganizationContext(orgId, (tx) =>
    tx.scoresheetImport.update({ where: { id: row.id }, data: { status: "INGESTED", ingestedAt: new Date(), fixtureId: result.fixtureId } }),
  );
  console.log(`Scoresheet import ${row.id} marked INGESTED (fixture ${result.fixtureId}).`);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const argOf = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);

  const scoresheetImportId = argOf("--scoresheetImportId");
  if (scoresheetImportId) {
    const gender = (argOf("--gender") ?? "MALE").toUpperCase() === "FEMALE" ? "FEMALE" : "MALE";
    await ingestApprovedScoresheet({ importId: scoresheetImportId, apply, gender, actorId: argOf("--actor") });
    return;
  }

  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--actor" && argv[i - 1] !== "--gender");
  const batchPath = positional[0];
  if (!batchPath) {
    console.error("Usage: npx tsx scripts/external-stats-ingest.ts <batch.json> [--apply]");
    console.error("       npx tsx scripts/external-stats-ingest.ts --scoresheetImportId <id> [--apply] [--gender MALE|FEMALE] [--actor <id>]");
    process.exitCode = 1;
    return;
  }
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
