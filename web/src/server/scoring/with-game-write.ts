import "server-only";

import { prisma } from "@/lib/prisma";
import type { AuthActor, EventSource, LedgerSourceHint, WriteContext } from "./types";

// Thin ergonomic wrapper for the live UI. Opens a transaction and calls the provided function
// with the transaction context. The sync endpoint doesn't use this — it opens its own transaction
// and loops over records, sharing one tx across all of them.
export async function withGameWrite<T>(
  ctx: {
    actor: AuthActor;
    source: EventSource;
    ledgerSourceHint?: LedgerSourceHint;
  },
  fn: (writeCtx: WriteContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    return fn({ ...ctx, tx });
  });
}
