import type { Prisma } from "@/generated/prisma/client";

export type PublicIdNamespace = "ATHLETE" | "STAFF";

const formats: Record<PublicIdNamespace, { prefix: string; width: number }> = {
  ATHLETE: { prefix: "UBA", width: 6 },
  STAFF: { prefix: "UBS", width: 6 },
};

export function formatPublicId(namespace: PublicIdNamespace, value: bigint | number) {
  const { prefix, width } = formats[namespace];
  return `${prefix}-${value.toString().padStart(width, "0")}`;
}

export async function allocatePublicId(tx: Prisma.TransactionClient, namespace: PublicIdNamespace) {
  const rows = await tx.$queryRaw<{ allocated: bigint }[]>`
    INSERT INTO "PublicIdCounter" ("namespace", "nextValue", "updatedAt")
    VALUES (${namespace}, 2, NOW())
    ON CONFLICT ("namespace")
    DO UPDATE SET "nextValue" = "PublicIdCounter"."nextValue" + 1, "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS allocated
  `;
  const allocated = rows[0]?.allocated;
  if (allocated === undefined) {
    throw new Error(`Unable to allocate public ID for ${namespace}.`);
  }
  return formatPublicId(namespace, allocated);
}

export async function ensureAthletePublicId(tx: Prisma.TransactionClient, athleteId: string) {
  const athlete = await tx.athlete.findUnique({
    where: { id: athleteId },
    select: { ultraAthleteId: true },
  });
  if (!athlete) throw new Error("Athlete not found.");
  if (athlete.ultraAthleteId) return athlete.ultraAthleteId;
  const ultraAthleteId = await allocatePublicId(tx, "ATHLETE");
  await tx.athlete.update({ where: { id: athleteId }, data: { ultraAthleteId } });
  return ultraAthleteId;
}

export async function ensureStaffPublicId(tx: Prisma.TransactionClient, staffId: string) {
  const staff = await tx.staff.findUnique({
    where: { id: staffId },
    select: { ultraStaffId: true },
  });
  if (!staff) throw new Error("Staff not found.");
  if (staff.ultraStaffId) return staff.ultraStaffId;
  const ultraStaffId = await allocatePublicId(tx, "STAFF");
  await tx.staff.update({ where: { id: staffId }, data: { ultraStaffId } });
  return ultraStaffId;
}
