"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ImportResolutionAction, ImportType } from "@/generated/prisma/enums";
import {
  MAX_IMPORT_FILE_BYTES,
  confirmImportJob,
  createImportJobFromCsv,
} from "@/lib/imports";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function permissionForType(type: ImportType) {
  if (type === ImportType.PLAYER) return "data:import:players" as const;
  if (type === ImportType.COACH) return "data:import:coaches" as const;
  return "data:import:clubs" as const;
}

function parseImportType(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !Object.values(ImportType).includes(value as ImportType)) {
    throw new Error("Valid import type is required.");
  }
  return value as ImportType;
}

function parseResolutionAction(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    !Object.values(ImportResolutionAction).includes(value as ImportResolutionAction)
  ) {
    throw new Error("Valid resolution action is required.");
  }
  return value as ImportResolutionAction;
}

export async function uploadImportCsv(formData: FormData) {
  const type = parseImportType(formData.get("type"));
  const session = await requirePermission(permissionForType(type));
  await requirePermission("data:import");

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("CSV file is required.");
  }
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    throw new Error("Only CSV files are supported.");
  }
  if (file.size === 0) {
    throw new Error("CSV file is empty.");
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`CSV file is too large. Maximum size is ${MAX_IMPORT_FILE_BYTES} bytes.`);
  }

  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text: string;
  try {
    text = decoder.decode(buffer);
  } catch {
    throw new Error("CSV must be valid UTF-8.");
  }

  const job = await createImportJobFromCsv({
    fileName: file.name,
    text,
    type,
    userId: session.user.id,
  });

  revalidatePath("/imports");
  redirect(`/imports/${job.id}`);
}

export async function updateImportRowResolution(formData: FormData) {
  await requirePermission("data:import:resolve");
  const rowId = formData.get("rowId");
  const action = parseResolutionAction(formData.get("resolutionAction"));
  const matchedEntityId = formData.get("matchedEntityId");
  const resolutionNote = formData.get("resolutionNote");

  if (typeof rowId !== "string" || !rowId) {
    throw new Error("Import row ID is required.");
  }

  const row = await prisma.importRow.update({
    data: {
      matchedEntityId:
        typeof matchedEntityId === "string" && matchedEntityId.trim() ? matchedEntityId.trim() : undefined,
      resolutionAction: action,
      resolutionData: {
        note: typeof resolutionNote === "string" ? resolutionNote.trim() : "",
      },
      status: action === "SKIP" || action === "REJECT" ? "RESOLVED" : "RESOLVED",
    },
    select: { importJobId: true },
    where: { id: rowId },
  });

  revalidatePath(`/imports/${row.importJobId}`);
}

export async function confirmImport(formData: FormData) {
  const session = await requirePermission("data:import:confirm");
  const importJobId = formData.get("importJobId");
  if (typeof importJobId !== "string" || !importJobId) {
    throw new Error("Import job ID is required.");
  }
  await confirmImportJob(importJobId, session.user.id);
  revalidatePath("/imports");
  revalidatePath(`/imports/${importJobId}`);
}

export async function cancelImport(formData: FormData) {
  await requirePermission("data:import:confirm");
  const importJobId = formData.get("importJobId");
  if (typeof importJobId !== "string" || !importJobId) {
    throw new Error("Import job ID is required.");
  }
  await prisma.importJob.update({
    data: { status: "CANCELLED" },
    where: { id: importJobId },
  });
  revalidatePath("/imports");
  revalidatePath(`/imports/${importJobId}`);
}
