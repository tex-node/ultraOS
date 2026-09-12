import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export type PublicIdNamespace = "ATHLETE" | "STAFF";

const WIDTH: Record<PublicIdNamespace, number> = { ATHLETE: 6, STAFF: 6 };

export function formatPublicId(prefix: string, namespace: PublicIdNamespace, value: bigint | number) {
  return `${prefix}-${value.toString().padStart(WIDTH[namespace], "0")}`;
}

// Phase 1 Stage 5.4A: allocation is genuinely tenant-scoped - PublicIdCounter is keyed by
// (organizationId, namespace), so two organizations allocate independently and neither ever
// advances the other's sequence. The formatted external id's uniqueness across the whole
// platform now rests on every organization having a distinct idPrefixAthlete/idPrefixStaff
// (enforced at the database level - both are @unique on Organization), not on the counter being
// a single global sequence like it was through Stage 5.2B-1.
export async function allocatePublicId(tx: Prisma.TransactionClient, organizationId: string, namespace: PublicIdNamespace) {
  const rows = await tx.$queryRaw<{ allocated: bigint }[]>`
    INSERT INTO "PublicIdCounter" ("id", "organizationId", "namespace", "nextValue", "updatedAt")
    VALUES (${randomUUID()}, ${organizationId}, ${namespace}, 2, NOW())
    ON CONFLICT ("organizationId", "namespace")
    DO UPDATE SET "nextValue" = "PublicIdCounter"."nextValue" + 1, "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS allocated
  `;
  const allocated = rows[0]?.allocated;
  if (allocated === undefined) {
    throw new Error(`Unable to allocate public ID for ${namespace} in organization ${organizationId}.`);
  }
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { idPrefixAthlete: true, idPrefixStaff: true },
  });
  const prefix = namespace === "ATHLETE" ? organization.idPrefixAthlete : organization.idPrefixStaff;
  return formatPublicId(prefix, namespace, allocated);
}

export async function ensureAthletePublicId(tx: Prisma.TransactionClient, organizationId: string, athleteId: string) {
  const athlete = await tx.athlete.findUnique({
    where: { id: athleteId },
    select: { ultraAthleteId: true },
  });
  if (!athlete) throw new Error("Athlete not found.");
  if (athlete.ultraAthleteId) return athlete.ultraAthleteId;
  const ultraAthleteId = await allocatePublicId(tx, organizationId, "ATHLETE");
  await tx.athlete.update({ where: { id: athleteId }, data: { ultraAthleteId } });
  return ultraAthleteId;
}

export async function ensureStaffPublicId(tx: Prisma.TransactionClient, organizationId: string, staffId: string) {
  const staff = await tx.staff.findUnique({
    where: { id: staffId },
    select: { ultraStaffId: true },
  });
  if (!staff) throw new Error("Staff not found.");
  if (staff.ultraStaffId) return staff.ultraStaffId;
  const ultraStaffId = await allocatePublicId(tx, organizationId, "STAFF");
  await tx.staff.update({ where: { id: staffId }, data: { ultraStaffId } });
  return ultraStaffId;
}
