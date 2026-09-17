"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { normalizeGameControlRole, parseGrantScope } from "@/lib/game-access";
import { withOrganizationContext } from "@/lib/tenant-context";

const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the user's email address."),
  role: z.string().min(1),
  scope: z.string().min(1),
});

// Grants game control to a user, scoped to one tournament (competition), season, event, or the whole
// organization. This is the alternative to giving someone a league-wide role just to run one
// tournament - see lib/game-access.ts for what each role can do.
export async function grantGameControl(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const input = grantSchema.parse(formDataToRecord(formData));
  const role = normalizeGameControlRole(input.role);
  if (!role) throw new Error("Unknown game-control role.");
  const scope = parseGrantScope(input.scope);
  if (!scope) throw new Error("Choose what to scope the access to.");

  await withOrganizationContext(organizationId, async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true },
    });
    if (!user) throw new Error("No user account exists with that email address.");

    // Every scope target must belong to the acting organization.
    if (scope.competitionId) {
      await tx.competition.findFirstOrThrow({ where: { id: scope.competitionId, organizationId }, select: { id: true } });
    }
    if (scope.seasonId) {
      await tx.season.findFirstOrThrow({ where: { id: scope.seasonId, organizationId }, select: { id: true } });
    }
    if (scope.eventId) {
      await tx.event.findFirstOrThrow({ where: { id: scope.eventId, organizationId }, select: { id: true } });
    }

    const existing = await tx.gameControlGrant.findFirst({
      where: { organizationId, userId: user.id, role, ...scope },
      select: { id: true },
    });
    if (existing) {
      await tx.gameControlGrant.update({ where: { id: existing.id }, data: { revokedAt: null } });
    } else {
      await tx.gameControlGrant.create({
        data: { organizationId, userId: user.id, role, ...scope, grantedById: session.user.id },
      });
    }

    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_CONTROL_GRANTED",
      entityType: "GameControlGrant",
      entityId: user.id,
      details: { role, scope, email: user.email },
    });
  });

  revalidatePath("/access");
}

// Revokes a grant. The row is kept so the history survives; readers ignore revoked rows.
export async function revokeGameControl(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const grantId = String(formData.get("grantId") ?? "");
  if (!grantId) throw new Error("Missing grant.");

  await withOrganizationContext(organizationId, async (tx) => {
    const grant = await tx.gameControlGrant.findFirstOrThrow({
      where: { id: grantId, organizationId },
      select: { id: true, role: true, userId: true },
    });
    await tx.gameControlGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "GAME_CONTROL_REVOKED",
      entityType: "GameControlGrant",
      entityId: grant.id,
      details: { role: grant.role, staffUserId: grant.userId },
    });
  });

  revalidatePath("/access");
}
