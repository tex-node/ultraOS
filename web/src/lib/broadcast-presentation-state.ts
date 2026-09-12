// Broadcast Presentation State (G.19, Part XXII-XXV). Persisted via the existing SystemSetting
// model rather than a new table - "prefer no migration if SystemSetting can safely hold this"
// (Part XXIII). This is the ONE place Preview/Program state is read or written; every graphics
// route and the control panel both go through it, so a service restart or a second browser tab
// always sees the same authoritative state (Part XXIV/XLI).
//
// This module controls only WHAT THE AUDIENCE SEES (which graphic, for which game/subject, is
// on Program) - it never writes Fixture/Game score, clock, PlayerStat/TeamStat, Standing, or any
// other canonical data. That boundary is why this file has no dependency on stats-actions.ts or
// games/actions.ts and cannot be reached from them either.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { BroadcastPresentationState, PresentationSlot } from "@/lib/broadcast-graphics";
import { EMPTY_PRESENTATION_STATE } from "@/lib/broadcast-graphics";
import { withOrganizationContext } from "@/lib/tenant-context";

const SETTING_KEY = "broadcast:presentation-state";
type Db = Prisma.TransactionClient | typeof prisma;

function isValidState(value: unknown): value is BroadcastPresentationState {
  return typeof value === "object" && value !== null && "preview" in value && "program" in value;
}

function scopedSettingKey(organizationId: string) {
  return `${SETTING_KEY}:${organizationId}`;
}

export async function getBroadcastPresentationState(
  organizationId: string,
  db: Db = prisma,
): Promise<BroadcastPresentationState> {
  const row = await db.systemSetting.findFirst({
    where: { organizationId, key: { in: [scopedSettingKey(organizationId), SETTING_KEY] } },
    orderBy: { key: "desc" },
  });
  if (!row || !isValidState(row.value)) return EMPTY_PRESENTATION_STATE;
  return row.value;
}

async function persist(
  state: BroadcastPresentationState,
  actorId: string,
  organizationId: string,
  db: Db,
): Promise<BroadcastPresentationState> {
  const next: BroadcastPresentationState = { ...state, updatedAt: new Date().toISOString(), updatedById: actorId };
  const existing = await db.systemSetting.findFirst({
    where: { organizationId, key: { in: [scopedSettingKey(organizationId), SETTING_KEY] } },
    orderBy: { key: "desc" },
    select: { key: true },
  });
  await db.systemSetting.upsert({
    where: { key: existing?.key ?? scopedSettingKey(organizationId) },
    create: { key: existing?.key ?? scopedSettingKey(organizationId), organizationId, value: next, category: "broadcast", description: "Broadcast Preview/Program presentation state (G.19)" },
    update: { value: next },
  });
  return next;
}

async function inOrganization<T>(organizationId: string, db: Db | undefined, fn: (tx: Db) => Promise<T>) {
  return db ? fn(db) : withOrganizationContext(organizationId, fn);
}

// Selecting a preview graphic is a harmless, frequent, purely-visual action for the operator -
// deliberately not audited (Part XXV: "No need to audit harmless preview selection").
export async function setPreview(slot: PresentationSlot, actorId: string, organizationId: string, db?: Db): Promise<BroadcastPresentationState> {
  return inOrganization(organizationId, db, async (tx) => {
    const current = await getBroadcastPresentationState(organizationId, tx);
    return persist({ ...current, preview: slot }, actorId, organizationId, tx);
  });
}

// TAKE atomically copies Preview into Program (Part XXV) - the one action that actually changes
// what a browser-source graphic shows on air, hence the only one worth an AuditLog entry.
export async function takeToProgram(actorId: string, organizationId: string, db?: Db): Promise<BroadcastPresentationState> {
  return inOrganization(organizationId, db, async (tx) => {
    const current = await getBroadcastPresentationState(organizationId, tx);
    const next = await persist({ ...current, program: current.preview }, actorId, organizationId, tx);
    await tx.auditLog.create({
    data: {
      organizationId, userId: actorId, action: "BROADCAST_GRAPHIC_TAKE", entityType: "BroadcastPresentationState",
      entityId: next.program?.gameId ?? "none",
      details: { graphicType: next.program?.graphicType ?? null, subjectId: next.program?.subjectId ?? null },
    },
    });
    return next;
  });
}

// CLEAR removes the Program graphic without touching Preview (Part XXV) - an operator can go
// blank on air, then TAKE the still-selected preview graphic right back without reselecting it.
export async function clearProgram(actorId: string, organizationId: string, db?: Db): Promise<BroadcastPresentationState> {
  return inOrganization(organizationId, db, async (tx) => {
    const current = await getBroadcastPresentationState(organizationId, tx);
    const clearedGameId = current.program?.gameId ?? null;
    const next = await persist({ ...current, program: null }, actorId, organizationId, tx);
    await tx.auditLog.create({
    data: { organizationId, userId: actorId, action: "BROADCAST_GRAPHIC_CLEAR", entityType: "BroadcastPresentationState", entityId: clearedGameId ?? "none", details: {} },
    });
    return next;
  });
}
