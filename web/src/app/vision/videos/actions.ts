"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import {
  createDraftCourtSpecification, updateDraftCourtSpecification, markCourtSpecificationOfficial,
  setGameAttackingDirection,
} from "@/lib/vision/vision-loader";
import type { CourtBasketSide } from "@/generated/prisma/enums";

export async function createDraftCourtSpecAction(formData: FormData) {
  const session = await requirePermission("vision:manage");
  const venueId = String(formData.get("venueId") ?? "");
  const effectiveSeasonId = String(formData.get("effectiveSeasonId") ?? "") || null;
  if (!venueId) throw new Error("venueId is required.");
  await createDraftCourtSpecification({ venueId, effectiveSeasonId, createdById: session.user.id });
  revalidatePath("/vision/videos");
}

export async function updateDraftCourtSpecAction(id: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const num = (key: string) => {
    const v = formData.get(key);
    if (v === null || v === "") return undefined;
    return Number(v);
  };
  await updateDraftCourtSpecification(id, {
    courtLengthUnits: num("courtLengthUnits") ?? null,
    courtWidthUnits: num("courtWidthUnits") ?? null,
    halfCourtX: num("halfCourtX") ?? null,
    basketACourtX: num("basketACourtX") ?? null,
    basketACourtY: num("basketACourtY") ?? null,
    basketBCourtX: num("basketBCourtX") ?? null,
    basketBCourtY: num("basketBCourtY") ?? null,
    originDescription: String(formData.get("originDescription") ?? "") || null,
    units: String(formData.get("units") ?? "meters"),
  }, session.user.id);
  revalidatePath("/vision/videos");
}

export async function markCourtSpecOfficialAction(id: string) {
  const session = await requirePermission("vision:manage");
  await markCourtSpecificationOfficial(id, session.user.id);
  revalidatePath("/vision/videos");
}

export async function setAttackingDirectionAction(gameId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const side = String(formData.get("homeAttacksBasketFirstHalf")) as CourtBasketSide;
  await setGameAttackingDirection(gameId, side, session.user.id);
  revalidatePath("/vision/videos");
}
