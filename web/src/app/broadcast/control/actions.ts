"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { setPreview, takeToProgram, clearProgram } from "@/lib/broadcast-presentation-state";
import type { GraphicType } from "@/lib/broadcast-graphics";
import { withOrganizationContext } from "@/lib/tenant-context";

// G.19 Part XXII-XXV. Every action here requires broadcast:operate and only ever touches
// BroadcastPresentationState (via broadcast-presentation-state.ts) - never Fixture/Game score,
// clock, PlayerStat/TeamStat, Standing, or any other canonical data (Part XXII's own boundary).
export async function setPreviewAction(gameId: string, graphicType: GraphicType, subjectId: string | null) {
  const { session, organizationId } = await requirePermissionWithOrganization("broadcast:operate");
  await withOrganizationContext(organizationId, (tx) => setPreview({ gameId, graphicType, subjectId }, session.user.id, organizationId, tx));
  revalidatePath("/broadcast/control");
}

export async function clearPreviewAction() {
  const { session, organizationId } = await requirePermissionWithOrganization("broadcast:operate");
  await withOrganizationContext(organizationId, (tx) => setPreview(null, session.user.id, organizationId, tx));
  revalidatePath("/broadcast/control");
}

export async function takeAction() {
  const { session, organizationId } = await requirePermissionWithOrganization("broadcast:operate");
  await withOrganizationContext(organizationId, (tx) => takeToProgram(session.user.id, organizationId, tx));
  revalidatePath("/broadcast/control");
}

export async function clearProgramAction() {
  const { session, organizationId } = await requirePermissionWithOrganization("broadcast:operate");
  await withOrganizationContext(organizationId, (tx) => clearProgram(session.user.id, organizationId, tx));
  revalidatePath("/broadcast/control");
}
