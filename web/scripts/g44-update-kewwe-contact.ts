import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const STAFF_ID = "cmsmlv4dp0005o9kke0kxrlnu";

async function main() {
  const before = await prisma.staff.findUniqueOrThrow({ where: { id: STAFF_ID } });
  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: STAFF_ID }, data: { email: "kesspee5050@gmail.com", phone: "+2347062822029" } });
    await writeAuditLog(tx, {
      action: "STAFF_CONTACT_UPDATED",
      details: { fields: { email: { new: "kesspee5050@gmail.com", old: before.email }, phone: { new: "+2347062822029", old: before.phone } }, staffName: before.name },
      entityId: STAFF_ID,
      entityType: "Staff",
      userId: ACTOR_ID,
    });
  });
  console.log("Coach Imomoh Kewwe Blessing: contact info updated.");
}

main().finally(() => prisma.$disconnect());
