import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// Game Day attendance, not roster membership. Stored the same lightweight way as the All-Star
// rosters (a JSON blob on SystemSetting) rather than a new relational model - this is ephemeral,
// single-event, admin-managed data with no reporting/query needs beyond "read it back for one
// event," so a migration would be more machinery than the problem calls for.
export type CheckInStatus = "PRESENT" | "LATE" | "ABSENT" | "UNAVAILABLE";

export type CheckInRecord = { status: CheckInStatus; updatedAt: string; updatedBy: string };

function keyFor(eventId: string) {
  return `gameday-checkin:${eventId}`;
}

export async function getCheckInStatuses(eventId: string): Promise<Record<string, CheckInRecord>> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: keyFor(eventId) } });
  return (setting?.value as Record<string, CheckInRecord> | undefined) ?? {};
}

export async function setCheckInStatus(eventId: string, playerId: string, status: CheckInStatus, actorId: string) {
  const key = keyFor(eventId);
  const record: CheckInRecord = { status, updatedAt: new Date().toISOString(), updatedBy: actorId };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.systemSetting.findUnique({ where: { key } });
    const value = (existing?.value as Record<string, CheckInRecord> | undefined) ?? {};
    const updated = { ...value, [playerId]: record };
    await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: updated },
      update: { value: updated },
    });
    await writeAuditLog(tx, {
      action: "GAMEDAY_CHECKIN_STATUS_SET",
      details: { eventId, playerId, status },
      entityId: `${eventId}:${playerId}`,
      entityType: "GameDayCheckIn",
      userId: actorId,
    });
  });
}
