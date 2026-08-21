import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

async function main() {
  for (const slug of ["zenith", "pulse"]) {
    const key = `all-star-team:${slug}`;
    const existing = await prisma.systemSetting.findUniqueOrThrow({ where: { key } });
    const value = { ...(existing.value as Record<string, unknown>), targetCoachCount: 4, targetPlayerCount: 4 };
    await prisma.systemSetting.update({ where: { key }, data: { value } });
    console.log(`${slug}: targetCoachCount=4, targetPlayerCount=4`);
  }

  const unassignedKey = "all-star-team:unassigned-coaches";
  const robinson = await prisma.staff.findUniqueOrThrow({ where: { id: "cmrh7meov0003c9kknsj5pq1r" }, select: { id: true, name: true, ultraStaffId: true } });
  const value = {
    coaches: [{ staffId: robinson.id, name: robinson.name, ultraStaffId: robinson.ultraStaffId }],
    note: "Each All-Star exhibition team (Zenith, Pulse) has exactly 4 coaches and will have exactly 4 players, assigned on match day. Coach David Robinson is intentionally unassigned to either all-star team — confirmed by administrator, not an omission.",
  };
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: unassignedKey },
      update: { value, description: "Coaches not assigned to either All-Star exhibition team", category: "all-star-exhibition" },
      create: { key: unassignedKey, value, description: "Coaches not assigned to either All-Star exhibition team", category: "all-star-exhibition" },
    });
    await writeAuditLog(tx, {
      action: "ALL_STAR_TEAM_METADATA_UPDATED",
      details: { note: value.note, unassignedCoach: robinson.name },
      entityId: "all-star-teams",
      entityType: "AllStarTeam",
      userId: ACTOR_ID,
    });
  });
  console.log("Recorded unassigned coach:", robinson.name);
}

main().finally(() => prisma.$disconnect());
