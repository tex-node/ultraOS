import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { readLocalMediaObject } from "@/lib/media-storage";
import type { OcrProvider } from "@/lib/ocr/provider";
import { extractScoresheet, type ExtractedTeamTable, type ScoresheetExtraction } from "@/lib/scoresheet/extract";
import { buildChecksumReport, type ChecksumReport } from "@/lib/scoresheet/checksums";
import { BUILT_IN_LAYOUTS, getLayout, parseLayout, type ScoresheetLayout } from "@/lib/scoresheet/templates";

// Server side of the I1 pipeline (P15): upload -> extract -> review -> approve -> ingest.
//
// Every database function here takes a transaction client and is meant to be called inside
// withOrganizationContext: the tables are RLS-protected, so a query on an unscoped client returns
// nothing (or fails on write) - the same rule the rest of the app follows. The OCR call itself is the
// one step that must NOT hold a transaction open (it shells out to Tesseract), so the action does:
//   read (tx) -> recognise (no tx) -> write (tx).
//
// Nothing auto-approves. Extraction leaves the row in REVIEW_REQUIRED, or FAILED with a reason; only
// `approveScoresheetImport` (a human action) moves it to APPROVED - the state the ingest CLI consumes.

export type CorrectedPlayer = {
  name: string;
  jerseyNumber: number | null;
  didNotPlay: boolean;
  minutesPlayed: number;
  points: number;
  fgm: number;
  fga: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  fouls: number;
};

export type CorrectedTeam = {
  clubName: string;
  players: CorrectedPlayer[];
  totals: { points: number; rebounds: number; assists: number; turnovers: number; fouls: number };
};

// What a reviewer approves. The ingest CLI turns this into the same IngestBoxScoreInput a
// hand-transcribed batch carries, so OCR feeds the existing pipeline rather than a second one.
export type CorrectedScoresheet = {
  version: string;
  sourceLabel: string;
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  periods: { label: string; homeScore: number; awayScore: number }[];
  home: CorrectedTeam;
  away: CorrectedTeam;
  approvedAt: string;
  approvedById: string;
  note?: string | null;
};

export function resolveLayout(templateLayout: unknown): ScoresheetLayout | null {
  return parseLayout(templateLayout) ?? getLayout("lbcl");
}

// Extraction row -> editable corrected player. Used by the review page to pre-fill the inputs.
// FGM/FGA/REB fall back to their components when the sheet did not print a total column, which is
// common on FIBA-style sheets that print made-attempted pairs.
export function correctedPlayerFromRow(row: ExtractedTeamTable["players"][number]): CorrectedPlayer {
  const value = (key: keyof ExtractedTeamTable["players"][number]["cells"]) => row.cells[key]?.value ?? 0;
  const minutes = Number.parseInt(row.minutesRaw.replace(/[^\d]/g, ""), 10);
  return {
    name: row.name,
    jerseyNumber: row.jerseyNumber,
    didNotPlay: row.didNotPlay,
    minutesPlayed: Number.isFinite(minutes) ? minutes : 0,
    points: value("points"),
    fgm: value("fgm") || value("fg2m") + value("fg3m") + value("fg4m"),
    fga: value("fga") || value("fg2a") + value("fg3a") + value("fg4a"),
    fg2m: value("fg2m"),
    fg2a: value("fg2a"),
    fg3m: value("fg3m"),
    fg3a: value("fg3a"),
    ftm: value("ftm"),
    fta: value("fta"),
    oreb: value("oreb"),
    dreb: value("dreb"),
    reb: value("reb") || value("oreb") + value("dreb"),
    assists: value("assists"),
    turnovers: value("turnovers"),
    steals: value("steals"),
    blocks: value("blocks"),
    fouls: value("fouls"),
  };
}

export async function createScoresheetImport(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; userId: string; mediaAssetId: string; sourceLabel: string; templateKey?: string },
): Promise<{ id: string }> {
  const key = args.templateKey && BUILT_IN_LAYOUTS[args.templateKey] ? args.templateKey : "lbcl";
  const builtIn = BUILT_IN_LAYOUTS[key];
  // Give the organization a real template row on first use, so the layout a sheet was read with is
  // auditable and editable later. Copy-on-first-use rather than a per-org seed migration (which
  // would have to hard-code every organization id).
  const template = await tx.scoresheetTemplate.upsert({
    where: { organizationId_name: { organizationId: args.organizationId, name: builtIn.name } },
    update: {},
    create: { organizationId: args.organizationId, name: builtIn.name, sportSlug: builtIn.sportSlug, layout: builtIn as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  const created = await tx.scoresheetImport.create({
    data: { organizationId: args.organizationId, mediaAssetId: args.mediaAssetId, templateId: template.id, sourceLabel: args.sourceLabel, status: "UPLOADED" },
    select: { id: true },
  });
  return { id: created.id };
}

export type ExtractionSource = { importId: string; objectKey: string; layout: ScoresheetLayout | null };

// Phase 1 of extraction: everything the OCR call needs, read inside the org transaction.
export async function loadExtractionSource(tx: Prisma.TransactionClient, organizationId: string, importId: string): Promise<ExtractionSource | null> {
  const row = await tx.scoresheetImport.findFirst({
    where: { id: importId, organizationId },
    select: { id: true, template: { select: { layout: true } }, mediaAsset: { select: { objectKey: true } } },
  });
  if (!row) return null;
  return { importId: row.id, objectKey: row.mediaAsset.objectKey, layout: resolveLayout(row.template?.layout) };
}

// Phase 2 (no transaction): run OCR + extraction over the stored image bytes.
export async function recogniseScoresheet(objectKey: string, layout: ScoresheetLayout, provider: OcrProvider): Promise<ScoresheetExtraction> {
  const bytes = await readLocalMediaObject(objectKey);
  const page = await provider.recogniseBuffer(bytes);
  return extractScoresheet([page], { layout, version: `${provider.name}-${layout.key}-1` });
}

// Phase 3: persist the extraction (or the failure) inside the org transaction.
export async function saveExtraction(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; importId: string; extraction: ScoresheetExtraction | null; failureReason: string | null },
): Promise<{ status: "EXTRACTED" | "FAILED" }> {
  const { organizationId, importId, extraction, failureReason } = args;
  if (!extraction || extraction.teams.length === 0) {
    const reason = failureReason ?? extraction?.warnings.join(" ") ?? "No table was found on this sheet.";
    await tx.scoresheetImport.updateMany({ where: { id: importId, organizationId }, data: { status: "FAILED", failureReason: reason } });
    return { status: "FAILED" };
  }
  const checksums = buildChecksumReport({ teams: extraction.teams.map((table, index) => ({ table, label: `team-${index + 1}` })) });
  await tx.scoresheetImport.updateMany({
    where: { id: importId, organizationId },
    data: {
      status: "REVIEW_REQUIRED",
      extractionVersion: extraction.version,
      extraction: extraction as unknown as Prisma.InputJsonValue,
      checksums: checksums as unknown as Prisma.InputJsonValue,
      failureReason: null,
    },
  });
  return { status: "EXTRACTED" };
}

export async function approveScoresheetImport(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; importId: string; userId: string; corrected: CorrectedScoresheet; checksums: ChecksumReport; note?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.checksums.ok) return { ok: false, error: "The checksum panel still has failing checks. Fix the cells or reject the sheet." };
  const row = await tx.scoresheetImport.findFirst({ where: { id: args.importId, organizationId: args.organizationId }, select: { id: true, status: true } });
  if (!row) return { ok: false, error: "Import not found." };
  if (row.status === "INGESTED") return { ok: false, error: "This import has already been ingested." };
  await tx.scoresheetImport.update({
    where: { id: row.id },
    data: {
      status: "APPROVED",
      corrected: { ...args.corrected, note: args.note ?? null } as unknown as Prisma.InputJsonValue,
      checksums: args.checksums as unknown as Prisma.InputJsonValue,
      reviewedById: args.userId,
      reviewedAt: new Date(),
      failureReason: null,
    },
  });
  return { ok: true };
}

export async function rejectScoresheetImport(tx: Prisma.TransactionClient, args: { organizationId: string; importId: string; userId: string; reason: string }) {
  await tx.scoresheetImport.updateMany({
    where: { id: args.importId, organizationId: args.organizationId, status: { not: "INGESTED" } },
    data: { status: "REJECTED", reviewedById: args.userId, reviewedAt: new Date(), failureReason: args.reason },
  });
}

export type ScoresheetImportListRow = {
  id: string;
  status: string;
  sourceLabel: string;
  createdAt: Date;
  extractionVersion: string;
  failureReason: string | null;
  reviewedAt: Date | null;
  imageUrl: string;
};

export async function listScoresheetImports(tx: Prisma.TransactionClient, organizationId: string, take = 50): Promise<ScoresheetImportListRow[]> {
  const rows = await tx.scoresheetImport.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, status: true, sourceLabel: true, createdAt: true, extractionVersion: true, failureReason: true, reviewedAt: true, mediaAsset: { select: { id: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    sourceLabel: row.sourceLabel,
    createdAt: row.createdAt,
    extractionVersion: row.extractionVersion,
    failureReason: row.failureReason,
    reviewedAt: row.reviewedAt,
    imageUrl: `/media/assets/${row.mediaAsset.id}/file`,
  }));
}

export async function loadScoresheetImportForReview(tx: Prisma.TransactionClient, organizationId: string, importId: string) {
  const row = await tx.scoresheetImport.findFirst({
    where: { id: importId, organizationId },
    select: {
      id: true,
      status: true,
      sourceLabel: true,
      extraction: true,
      checksums: true,
      corrected: true,
      failureReason: true,
      extractionVersion: true,
      reviewedAt: true,
      mediaAsset: { select: { id: true, originalFilename: true, width: true, height: true } },
    },
  });
  if (!row) return null;
  const extraction = row.extraction as unknown as { teams?: ScoresheetExtraction["teams"]; warnings?: string[]; version?: string } | null;
  return { ...row, extraction, imageUrl: `/media/assets/${row.mediaAsset.id}/file` };
}
