import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getSportDefinition } from "@/lib/sports/registry";
import { metricSubjectKey } from "@/lib/sports/metric-values";
import { metricChecksums, type MetricChecksumReport, type MetricScoresheet } from "@/lib/scoresheet/metric-scoresheet";
import { writeAuditLog } from "@/lib/audit";

// The multi-sport half of the review queue (streak v7, Prompt 2).
//
// Basketball keeps its own `CorrectedPlayer` import/approve path untouched. This module handles a sheet whose
// columns come from the sport definition: it stores the metric sheet as the extraction, approves the reviewed
// version, and ingests it into GameMetricValue rows keyed by (game, metric definition, subject).
//
// The ingest is deliberately strict about player matching: a name that does not resolve to a player on the
// fixture's side is SKIPPED and reported, never created. Inventing an athlete from a mis-typed scoresheet row
// would put a person in the league who does not exist.

export type MetricIngestResult = {
  written: number;
  skipped: { team: string; player: string; reason: string }[];
  perPlayer: { team: string; player: string; metrics: number }[];
};

export async function createMetricScoresheetImport(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    userId: string;
    sourceLabel: string;
    sheet: MetricScoresheet;
    format: "CSV" | "XLSX";
    sourceInfo?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  const definition = getSportDefinition(args.sheet.sportSlug);
  if (!definition) throw new Error(`unknown sport "${args.sheet.sportSlug}"`);
  const report = metricChecksums(args.sheet, definition);

  const created = await tx.scoresheetImport.create({
    data: {
      organizationId: args.organizationId,
      status: "REVIEW_REQUIRED",
      format: args.format,
      extractionVersion: `metric-${args.sheet.sportSlug}-1`,
      extraction: { ...args.sheet, ...(args.sourceInfo ?? {}) } as unknown as Prisma.InputJsonValue,
      checksums: report as unknown as Prisma.InputJsonValue,
      sourceLabel: args.sourceLabel,
    },
    select: { id: true },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "SCORESHEET_UPLOADED",
    entityType: "ScoresheetImport",
    entityId: created.id,
    details: { sport: args.sheet.sportSlug, format: args.format, teams: args.sheet.teams.map((team) => team.clubName), checksumsOk: report.ok },
  });
  return created;
}

/** Store the reviewed sheet and move the import to APPROVED. Checksums are re-run here, server-side. */
export async function approveMetricScoresheet(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; importId: string; userId: string; sheet: MetricScoresheet },
): Promise<{ ok: true; report: MetricChecksumReport } | { ok: false; report: MetricChecksumReport; error: string }> {
  const definition = getSportDefinition(args.sheet.sportSlug);
  if (!definition) return { ok: false, report: { ok: false, checks: [], totals: [] }, error: `unknown sport "${args.sheet.sportSlug}"` };
  const report = metricChecksums(args.sheet, definition);
  if (!report.ok) {
    return { ok: false, report, error: "Checksums are failing - fix the highlighted rows before approving. Nothing was saved." };
  }
  const row = await tx.scoresheetImport.findFirst({ where: { id: args.importId, organizationId: args.organizationId }, select: { id: true, status: true } });
  if (!row) return { ok: false, report, error: "That scoresheet no longer exists." };
  if (row.status === "INGESTED") return { ok: false, report, error: "This sheet has already been ingested and cannot be re-approved." };

  await tx.scoresheetImport.update({
    where: { id: args.importId },
    data: {
      status: "APPROVED",
      corrected: { ...args.sheet, approvedAt: new Date().toISOString(), approvedById: args.userId } as unknown as Prisma.InputJsonValue,
      checksums: report as unknown as Prisma.InputJsonValue,
      reviewedById: args.userId,
      reviewedAt: new Date(),
    },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "SCORESHEET_APPROVED",
    entityType: "ScoresheetImport",
    entityId: args.importId,
    details: { sport: args.sheet.sportSlug, checks: report.checks.length },
  });
  return { ok: true, report };
}

/**
 * Write the approved sheet into GameMetricValue rows for one fixture's game.
 *
 * Idempotent per (game, metric definition, player): existing rows for the same triple are replaced, so
 * re-running after a correction updates rather than duplicates. Unmatched players and unknown metric keys are
 * reported, never invented.
 */
export async function ingestMetricScoresheet(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; importId: string; fixtureId: string; userId: string },
): Promise<MetricIngestResult> {
  const row = await tx.scoresheetImport.findFirst({
    where: { id: args.importId, organizationId: args.organizationId },
    select: { id: true, status: true, corrected: true, extraction: true },
  });
  if (!row) throw new Error("SCORESHEET_NOT_FOUND");
  if (row.status !== "APPROVED" && row.status !== "INGESTED") throw new Error("SCORESHEET_NOT_APPROVED");
  const sheet = (row.corrected ?? row.extraction) as unknown as MetricScoresheet | null;
  if (!sheet || !Array.isArray(sheet.teams)) throw new Error("SCORESHEET_HAS_NO_METRIC_DATA");

  const definition = getSportDefinition(sheet.sportSlug);
  if (!definition) throw new Error(`unknown sport "${sheet.sportSlug}"`);

  const fixture = await tx.fixture.findFirst({
    where: { id: args.fixtureId, organizationId: args.organizationId },
    select: {
      id: true,
      seasonId: true,
      game: { select: { id: true } },
      homeSeasonClub: { select: { id: true, club: { select: { name: true } }, players: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } } } } },
      awaySeasonClub: { select: { id: true, club: { select: { name: true } }, players: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } } } } },
    },
  });
  if (!fixture) throw new Error("FIXTURE_NOT_FOUND");
  if (!fixture.game) throw new Error("FIXTURE_HAS_NO_GAME");

  const sport = await tx.sport.findFirst({ where: { slug: sheet.sportSlug }, select: { id: true } });
  if (!sport) throw new Error(`no Sport row for "${sheet.sportSlug}"`);
  const metricRows = await tx.sportMetricDefinition.findMany({ where: { sportId: sport.id, subject: "PLAYER" }, select: { id: true, key: true } });
  const definitionIdByKey = new Map(metricRows.map((metric) => [metric.key, metric.id]));

  const sides = [
    { sheetTeam: sheet.teams[0], club: fixture.homeSeasonClub },
    { sheetTeam: sheet.teams[1], club: fixture.awaySeasonClub },
  ];

  const result: MetricIngestResult = { written: 0, skipped: [], perPlayer: [] };
  for (const side of sides) {
    if (!side.sheetTeam) continue;
    const team = side.sheetTeam;
    if (!side.club) {
      result.skipped.push({ team: team.clubName, player: "(all)", reason: "the fixture has no side for this team" });
      continue;
    }
    for (const player of team.players) {
      const normalized = player.name.trim().toLowerCase();
      const match =
        side.club.players.find((candidate) => `${candidate.athlete.firstName} ${candidate.athlete.lastName}`.trim().toLowerCase() === normalized) ??
        side.club.players.find((candidate) => `${candidate.athlete.firstName} ${candidate.athlete.lastName}`.toLowerCase().includes(normalized)) ??
        side.club.players.find((candidate) => normalized.includes(candidate.athlete.lastName.toLowerCase()));
      if (!match) {
        result.skipped.push({ team: team.clubName, player: player.name, reason: "no matching player on this side's roster" });
        continue;
      }
      let writtenForPlayer = 0;
      for (const [key, value] of Object.entries(player.metrics)) {
        const definitionId = definitionIdByKey.get(key);
        if (!definitionId) {
          result.skipped.push({ team: team.clubName, player: player.name, reason: `"${key}" is not a ${definition.name} player metric` });
          continue;
        }
        await tx.gameMetricValue.deleteMany({ where: { organizationId: args.organizationId, gameId: fixture.game.id, metricDefinitionId: definitionId, playerId: match.id } });
        await tx.gameMetricValue.create({
          data: {
            organizationId: args.organizationId,
            gameId: fixture.game.id,
            metricDefinitionId: definitionId,
            subjectType: "PLAYER",
            subjectKey: metricSubjectKey("PLAYER", match.id),
            playerId: match.id,
            period: 0,
            value,
            statSource: "CSV_IMPORT",
          },
        });
        result.written += 1;
        writtenForPlayer += 1;
      }
      result.perPlayer.push({ team: team.clubName, player: player.name, metrics: writtenForPlayer });
    }
  }

  await tx.scoresheetImport.update({
    where: { id: args.importId },
    data: { status: "INGESTED", ingestedAt: new Date(), fixtureId: args.fixtureId },
  });
  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "SCORESHEET_INGESTED",
    entityType: "ScoresheetImport",
    entityId: args.importId,
    details: { sport: sheet.sportSlug, fixtureId: args.fixtureId, written: result.written, skipped: result.skipped.length },
  });
  return result;
}
