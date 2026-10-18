"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { uploadMediaAsset } from "@/lib/media-storage";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadExtractionSource, recogniseScoresheet } from "@/server/scoresheet/ocr-source";
import { createOcrProvider } from "@/lib/ocr/tesseract";
import { buildChecksumReport, type ChecksumReport } from "@/lib/scoresheet/checksums";
import { correctedTeamToTable } from "@/lib/scoresheet/corrected";
import { csvToCorrected, parseBoxScoreCsv } from "@/lib/scoresheet/csv-extract";
import { looksLikeXlsx, parseBoxScoreXlsx } from "@/lib/scoresheet/excel-extract";
import {
  approveScoresheetImport,
  createCsvScoresheetImport,
  createScoresheetImport,
  rejectScoresheetImport,
  saveExtraction,
  type CorrectedScoresheet,
} from "@/server/scoresheet/imports";

// I1 actions (P15): upload + extract, and the review decisions.
//
// Uploading runs OCR inline: the media pipeline stores the image and validates it (type, size,
// checksum), the import row is created, then Tesseract runs OUTSIDE any transaction (it shells out
// and can take seconds), and the result is saved in a second short transaction. Any failure leaves a
// FAILED import with the reason - never a half-written approval.

const correctedPlayerSchema = z.object({
  name: z.string().min(1),
  jerseyNumber: z.number().int().nullable(),
  didNotPlay: z.boolean(),
  minutesPlayed: z.number().int().min(0).max(200),
  points: z.number().int().min(0).max(200),
  fgm: z.number().int().min(0).max(200),
  fga: z.number().int().min(0).max(200),
  fg2m: z.number().int().min(0).max(200),
  fg2a: z.number().int().min(0).max(200),
  fg3m: z.number().int().min(0).max(200),
  fg3a: z.number().int().min(0).max(200),
  ftm: z.number().int().min(0).max(200),
  fta: z.number().int().min(0).max(200),
  oreb: z.number().int().min(0).max(200),
  dreb: z.number().int().min(0).max(200),
  reb: z.number().int().min(0).max(200),
  assists: z.number().int().min(0).max(200),
  turnovers: z.number().int().min(0).max(200),
  steals: z.number().int().min(0).max(200),
  blocks: z.number().int().min(0).max(200),
  fouls: z.number().int().min(0).max(200),
});

const correctedTeamSchema = z.object({
  clubName: z.string().min(1),
  players: z.array(correctedPlayerSchema).max(30),
  totals: z.object({ points: z.number().int().min(0), rebounds: z.number().int().min(0), assists: z.number().int().min(0), turnovers: z.number().int().min(0), fouls: z.number().int().min(0) }),
});

const reviewPayloadSchema = z.object({
  scheduledAt: z.string().min(1),
  homeScore: z.number().int().min(0).max(400),
  awayScore: z.number().int().min(0).max(400),
  periods: z.array(z.object({ label: z.string(), homeScore: z.number().int().min(0), awayScore: z.number().int().min(0) })).max(8),
  home: correctedTeamSchema,
  away: correctedTeamSchema,
  note: z.string().max(500).optional(),
});

export type ReviewState = {
  report?: ChecksumReport;
  error?: string;
  approved?: boolean;
  rejected?: boolean;
};

// The correction -> extractor-shape converter now lives in lib/scoresheet/corrected.ts so the CSV path
// uses the same one (see csvToCorrected / correctedTeamToTable).

export async function uploadScoresheet(formData: FormData): Promise<void> {
  const { session, organizationId } = await requirePermissionWithOrganization("data:import");
  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  const templateKey = String(formData.get("templateKey") ?? "lbcl");
  if (!(file instanceof File) || file.size === 0) redirect("/scoresheets?error=Choose+a+scoresheet+image+(JPG+or+PNG).");
  if (!sourceLabel) redirect("/scoresheets?error=Add+a+label+so+the+sheet+is+identifiable+later.");

  let importId: string | null = null;
  try {
    const asset = await withOrganizationContext(organizationId, (tx) =>
      uploadMediaAsset({
        tx,
        organizationId,
        file: file as File,
        purpose: "SCORESHEET_IMAGE",
        uploadedById: session.user.id,
        title: sourceLabel,
        visibility: "PRIVATE",
      }),
    );
    const created = await withOrganizationContext(organizationId, (tx) =>
      createScoresheetImport(tx, { organizationId, userId: session.user.id, mediaAssetId: asset.id, sourceLabel, templateKey }),
    );
    importId = created.id;

    const source = await withOrganizationContext(organizationId, (tx) => loadExtractionSource(tx, organizationId, created.id));
    let extraction = null;
    let failureReason: string | null = null;
    if (!source?.layout) {
      failureReason = "No scoresheet layout is configured for this organization.";
    } else if (!source.objectKey) {
      // An IMAGE import always has a stored file; a missing one means the asset row is inconsistent.
      failureReason = "The uploaded sheet has no stored file, so there is nothing to read.";
    } else {
      try {
        extraction = await recogniseScoresheet(source.objectKey, source.layout, createOcrProvider());
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
      }
    }
    await withOrganizationContext(organizationId, (tx) => saveExtraction(tx, { organizationId, importId: created.id, extraction, failureReason }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    redirect(`/scoresheets?error=${encodeURIComponent(reason.slice(0, 200))}`);
  }
  revalidatePath("/scoresheets");
  redirect(`/scoresheets/${importId}/review`);
}

export async function reviewScoresheet(importId: string, _state: ReviewState, formData: FormData): Promise<ReviewState> {
  const { session, organizationId } = await requirePermissionWithOrganization("data:import");
  const intent = String(formData.get("intent") ?? "check");
  const raw = String(formData.get("payload") ?? "");

  if (intent === "reject") {
    const reason = String(formData.get("rejectReason") ?? "").trim();
    if (reason.length < 5) return { error: "Give a reason of at least 5 characters so the rejection is traceable." };
    await withOrganizationContext(organizationId, (tx) => rejectScoresheetImport(tx, { organizationId, importId, userId: session.user.id, reason }));
    revalidatePath(`/scoresheets/${importId}/review`);
    revalidatePath("/scoresheets");
    return { rejected: true };
  }

  let payload: z.infer<typeof reviewPayloadSchema>;
  try {
    payload = reviewPayloadSchema.parse(JSON.parse(raw));
  } catch (error) {
    return { error: `The form could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }

  const homeTable = correctedTeamToTable(payload.home);
  const awayTable = correctedTeamToTable(payload.away);
  const checksums = buildChecksumReport({
    teams: [
      { table: homeTable, label: payload.home.clubName },
      { table: awayTable, label: payload.away.clubName },
    ],
    periods: payload.periods,
    homeScore: payload.homeScore,
    awayScore: payload.awayScore,
  });

  if (intent === "check") return { report: checksums };
  if (!checksums.ok) {
    return { report: checksums, error: "Checksums are failing - fix the highlighted cells before approving. Nothing was saved." };
  }

  const corrected: CorrectedScoresheet = {
    version: "lbcl-1",
    sourceLabel: payload.home.clubName + " vs " + payload.away.clubName,
    scheduledAt: payload.scheduledAt,
    homeScore: payload.homeScore,
    awayScore: payload.awayScore,
    periods: payload.periods,
    home: payload.home,
    away: payload.away,
    approvedAt: new Date().toISOString(),
    approvedById: session.user.id,
  };
  const result = await withOrganizationContext(organizationId, (tx) =>
    approveScoresheetImport(tx, { organizationId, importId, userId: session.user.id, corrected, checksums, note: payload.note ?? null }),
  );
  if (!result.ok) return { report: checksums, error: result.error };
  revalidatePath(`/scoresheets/${importId}/review`);
  revalidatePath("/scoresheets");
  return { report: checksums, approved: true };
}

// I1 pivot: the CSV path. No OCR, no image, no transaction spanning a slow call - the file is parsed
// and validated in memory, then stored as REVIEW_REQUIRED with its checksums. A human still approves it
// on the same review page, and the same ingest CLI consumes it, so this is a shorter road to the same
// gate rather than a second pipeline.
export async function uploadCsvScoresheet(formData: FormData): Promise<void> {
  const { session, organizationId } = await requirePermissionWithOrganization("data:import");
  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) redirect("/scoresheets?error=Choose+a+CSV+or+.xlsx+file.");
  if (!sourceLabel) redirect("/scoresheets?error=Add+a+label+so+the+sheet+is+identifiable+later.");
  if (file.size > 5_000_000) redirect("/scoresheets?error=That+file+is+larger+than+5+MB+-+a+box-score+export+should+be+small.");

  // One upload form, two container formats: the bytes decide, not the file name (an operator renaming a
  // file must not change how it is read). An .xlsx is a zip container; anything else is treated as CSV.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isWorkbook = file.name.toLowerCase().endsWith(".xlsx") || looksLikeXlsx(bytes);

  let parsed;
  let format: "CSV" | "XLSX" = "CSV";
  let sourceInfo: Record<string, unknown> | undefined;
  try {
    if (isWorkbook) {
      const workbook = parseBoxScoreXlsx(bytes);
      parsed = workbook.parsed;
      format = "XLSX";
      sourceInfo = { sourceFile: file.name, workbook: workbook.summary };
    } else {
      parsed = parseBoxScoreCsv(new TextDecoder().decode(bytes));
      sourceInfo = { sourceFile: file.name };
    }
  } catch (error) {
    redirect(`/scoresheets?error=${encodeURIComponent(`Could not read that file: ${error instanceof Error ? error.message : String(error)}`)}`);
  }

  let corrected;
  try {
    corrected = csvToCorrected(parsed, { sourceLabel });
  } catch (error) {
    redirect(`/scoresheets?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }

  const checksums = buildChecksumReport({
    teams: [
      { table: correctedTeamToTable(corrected.home), label: corrected.home.clubName },
      { table: correctedTeamToTable(corrected.away), label: corrected.away.clubName },
    ],
    periods: corrected.periods,
    homeScore: corrected.homeScore,
    awayScore: corrected.awayScore,
  });

  const created = await withOrganizationContext(organizationId, (tx) =>
    createCsvScoresheetImport(tx, { organizationId, userId: session.user.id, sourceLabel, parsed, corrected, checksums, format, sourceInfo }),
  );
  revalidatePath("/scoresheets");
  redirect(`/scoresheets/${created.id}/review`);
}
