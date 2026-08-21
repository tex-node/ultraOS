import { ApplicationType } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const SETTING_KEY = "application-intake:closed-types";

type IntakeSetting = { types: ApplicationType[]; updatedAt: string; updatedBy: string; reason?: string };

export async function getClosedApplicationTypes(): Promise<ApplicationType[]> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
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
