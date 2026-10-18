import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { readLocalMediaObject } from "@/lib/media-storage";
import type { OcrProvider } from "@/lib/ocr/provider";
import { extractScoresheet, type ScoresheetExtraction } from "@/lib/scoresheet/extract";
import { resolveLayout } from "./imports";
import type { ScoresheetLayout } from "@/lib/scoresheet/templates";

// The IMAGE half of the I1 pipeline, kept separate from server/scoresheet/imports.ts on purpose.
//
// imports.ts is the DB half (create/approve/reject/list) and is imported by CLI scripts that run outside
// Next; media-storage pulls in next/* modules, which tsx cannot load in that context (measured: a
// "createContext is not a function" crash). Splitting them means the DB module stays CLI-friendly and the
// OCR module keeps its server-only dependencies - the CSV path uses only the DB module.

export type ExtractionSource = { importId: string; objectKey: string | null; layout: ScoresheetLayout | null };

// Phase 1 of extraction: everything the OCR call needs, read inside the org transaction.
export async function loadExtractionSource(tx: Prisma.TransactionClient, organizationId: string, importId: string): Promise<ExtractionSource | null> {
  const row = await tx.scoresheetImport.findFirst({
    where: { id: importId, organizationId },
    select: { id: true, template: { select: { layout: true } }, mediaAsset: { select: { objectKey: true } } },
  });
  if (!row) return null;
  return { importId: row.id, objectKey: row.mediaAsset?.objectKey ?? null, layout: resolveLayout(row.template?.layout) };
}

// Phase 2 (no transaction): run OCR + extraction over the stored image bytes.
export async function recogniseScoresheet(objectKey: string, layout: ScoresheetLayout, provider: OcrProvider): Promise<ScoresheetExtraction> {
  const bytes = await readLocalMediaObject(objectKey);
  const page = await provider.recogniseBuffer(bytes);
  return extractScoresheet([page], { layout, version: `${provider.name}-${layout.key}-1` });
}
