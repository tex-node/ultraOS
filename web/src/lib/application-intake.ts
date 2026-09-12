import { ApplicationType } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

const SETTING_KEY = "application-intake:closed-types";

type IntakeSetting = { types: ApplicationType[]; updatedAt: string; updatedBy: string; reason?: string };

// Phase 1 Stage 5.2B-1: wrapped in real org context (the request-scoping gate), same treatment
// as game-day-checkin.ts's SystemSetting-backed lookups in 5.2A - the `key` itself is still
// globally unique, which is Stage 5.4's job to fix, not conflated here.
export async function getClosedApplicationTypes(organizationId: string): Promise<ApplicationType[]> {
  const setting = await withOrganizationContext(organizationId, (tx) => tx.systemSetting.findUnique({ where: { key: SETTING_KEY } }));
  if (!setting) return [];
  const value = setting.value as IntakeSetting;
  return value.types ?? [];
}

export async function setApplicationTypeClosed(type: ApplicationType, closed: boolean, actorId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const setting = await tx.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const current = new Set<ApplicationType>((setting?.value as IntakeSetting | undefined)?.types ?? []);
    const wasClosed = current.has(type);
    if (closed) current.add(type);
    else current.delete(type);

    const value: IntakeSetting = { reason, types: [...current], updatedAt: new Date().toISOString(), updatedBy: actorId };
    await tx.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value },
      create: { category: "applications", description: "Application types temporarily closed to new public submissions.", key: SETTING_KEY, value },
    });

    if (wasClosed !== closed) {
      await writeAuditLog(tx, {
        action: closed ? "APPLICATION_INTAKE_CLOSED" : "APPLICATION_INTAKE_REOPENED",
        details: { reason: reason ?? null, type },
        entityId: type,
        entityType: "ApplicationIntakeSetting",
        userId: actorId,
      });
    }
    return [...current];
  });
}
