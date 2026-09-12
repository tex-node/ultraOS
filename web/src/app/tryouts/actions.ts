"use server";

import { revalidatePath } from "next/cache";
import { DraftSelectionGroup } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

const groupValues = new Set<string>(Object.values(DraftSelectionGroup));

function parseGroup(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !groupValues.has(value)) {
    throw new Error("Valid draft selection group is required.");
  }
  return value as DraftSelectionGroup;
}

function optionalText(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optionalScore(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Tryout score must be between 0 and 100.");
  }
  return parsed;
}

export async function updatePlayerTryout(playerId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft:manage");
  const draftSelectionGroup = parseGroup(formData.get("draftSelectionGroup"));
  const tryoutNumber = optionalText(formData.get("tryoutNumber"));
  const selectionNotes = optionalText(formData.get("selectionNotes"));
  const tryoutScore = optionalScore(formData.get("tryoutScore"));

  await withOrganizationContext(organizationId, async (tx) => {
    const player = await tx.player.update({
      data: {
        draftSelectionGroup,
        selectedAt: new Date(),
        selectedById: session.user.id,
        selectionNotes,
        tryoutNumber,
        tryoutScore,
      },
      select: { id: true, seasonId: true },
      where: { id: playerId },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "PLAYER_TRYOUT_SELECTION_UPDATED",
      details: { draftSelectionGroup, playerId, selectionNotes, tryoutNumber, tryoutScore },
      entityId: player.id,
      entityType: "Player",
      userId: session.user.id,
    });
  });

  revalidatePath("/tryouts");
  revalidatePath(`/tryouts/${draftSelectionGroup.toLowerCase().replaceAll("_", "-")}`);
}

export async function bulkUpdateTryoutGroup(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft:manage");
  const draftSelectionGroup = parseGroup(formData.get("draftSelectionGroup"));
  const playerIds = formData
    .getAll("playerId")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const selectionNotes = optionalText(formData.get("selectionNotes"));

  if (playerIds.length === 0) {
    throw new Error("Select at least one player.");
  }

  await withOrganizationContext(organizationId, async (tx) => {
    // Phase 1 Stage 5.2B-3: updateMany's WHERE (id IN (...)) is not itself org-filtered, but
    // RLS applies to every row this scoped tx touches - a foreign-org playerId in the list is
    // invisible to this UPDATE and is silently excluded from the affected rows, never touched.
    // No partial cross-org write is possible; the audit log below still records every id that
    // was requested, not just the ones RLS actually let through, since the request itself is
    // what's being audited.
    const updated = await tx.player.updateMany({
      data: {
        draftSelectionGroup,
        selectedAt: new Date(),
        selectedById: session.user.id,
        selectionNotes,
      },
      where: { id: { in: playerIds } },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "PLAYER_TRYOUT_SELECTION_BULK_UPDATED",
      details: { count: playerIds.length, updatedCount: updated.count, draftSelectionGroup, playerIds, selectionNotes },
      entityId: draftSelectionGroup,
      entityType: "Player",
      userId: session.user.id,
    });
  });

  revalidatePath("/tryouts");
  revalidatePath(`/tryouts/${draftSelectionGroup.toLowerCase().replaceAll("_", "-")}`);
}
