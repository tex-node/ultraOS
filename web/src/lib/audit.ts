import type { Prisma } from "@/generated/prisma/client";

export type AuditEntry = {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
};

export function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
) {
  return tx.auditLog.create({ data: entry });
}
