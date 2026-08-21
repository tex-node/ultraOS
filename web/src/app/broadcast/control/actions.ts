"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import { setPreview, takeToProgram, clearProgram } from "@/lib/broadcast-presentation-state";
import type { GraphicType } from "@/lib/broadcast-graphics";

// G.19 Part XXII-XXV. Every action here requires broadcast:operate and only ever touches
// BroadcastPresentationState (via broadcast-presentation-state.ts) - never Fixture/Game score,
// clock, PlayerStat/TeamStat, Standing, or any other canonical data (Part XXII's own boundary).
export async function setPreviewAction(gameId: string, graphicType: GraphicType, subjectId: string | null) {
  const session = await requirePermission("broadcast:operate");
  await setPreview({ gameId, graphicType, subjectId }, session.user.id);
  revalidatePath("/broadcast/control");
}

export async function clearPreviewAction() {
  const session = await requirePermission("broadcast:operate");
  await setPreview(null, session.user.id);
  revalidatePath("/broadcast/control");
}

export async function takeAction() {
  const session = await requirePermission("broadcast:operate");
  await takeToProgram(session.user.id);
  revalidatePath("/broadcast/control");
}

export async function clearProgramAction() {
  const session = await requirePermission("broadcast:operate");
  await clearProgram(session.user.id);
  revalidatePath("/broadcast/control");
}
