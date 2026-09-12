import { writeAuditLog } from "@/lib/audit";
import { withOrganizationContext } from "@/lib/tenant-context";

// Game Day attendance, not roster membership. Stored the same lightweight way as the All-Star
// rosters (a JSON blob on SystemSetting) rather than a new relational model - this is ephemeral,
// single-event, admin-managed data with no reporting/query needs beyond "read it back for one
// event," so a migration would be more machinery than the problem calls for.
export type CheckInStatus = "PRESENT" | "LATE" | "ABSENT" | "UNAVAILABLE";

export type CheckInRecord = { status: CheckInStatus; updatedAt: string; updatedBy: string };

function keyFor(eventId: string) {
  return `gameday-checkin:${eventId}`;
}

export async function getCheckInStatuses(organizationId: string, eventId: string): Promise<Record<string, CheckInRecord>> {
  const setting = await withOrganizationContext(organizationId, (tx) => tx.systemSetting.findUnique({ where: { key: keyFor(eventId) } }));
  return (setting?.value as Record<string, CheckInRecord> | undefined) ?? {};
}

// Phase 1 Stage 5.2: wrapped in real org context (the request-scoping gate), but the `key`
// lookup itself is still globally unique - see SystemSetting's schema.prisma doc comment. Making
// it genuinely per-org is Stage 5.4's job, not this one; deliberately not conflated here.
export async function setCheckInStatus(organizationId: string, eventId: string, playerId: string, status: CheckInStatus, actorId: string) {
  const key = keyFor(eventId);
  const record: CheckInRecord = { status, updatedAt: new Date().toISOString(), updatedBy: actorId };

  await withOrganizationContext(organizationId, async (tx) => {
    const existing = await tx.systemSetting.findUnique({ where: { key } });
    const value = (existing?.value as Record<string, CheckInRecord> | undefined) ?? {};
    const updated = { ...value, [playerId]: record };
    await tx.systemSetting.upsert({
      where: { key },
      create: { organizationId, key, value: updated },
      update: { value: updated },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "GAMEDAY_CHECKIN_STATUS_SET",
      details: { eventId, playerId, status },
      entityId: `${eventId}:${playerId}`,
      entityType: "GameDayCheckIn",
      userId: actorId,
    });
  });
}
