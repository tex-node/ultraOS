import type { Prisma } from "@/generated/prisma/client";

export type AuditEntry = {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
  // Phase 1 Stage 5.2: optional for now, not required - being threaded through call sites batch
  // by batch (see the Stage 5.2 plan) rather than all 34 files at once. Omitting it falls back to
  // the temporary Stage 3a DB default, same as an unconverted call site always has. Every NEW or
  // already-converted call site should pass it explicitly; a call site with real org context
  // available that omits this is a bug, not a valid state to leave permanently.
  organizationId?: string;
};

export function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
) {
  return tx.auditLog.create({ data: entry });
}
