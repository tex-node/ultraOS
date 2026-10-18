import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  buildCoachingPlanSnapshot,
  isAdoptablePlan,
  parseCoachingPlanSnapshot,
  type CoachingPlanSnapshot,
} from "@/lib/coaching/plan-snapshot";
import type { PlayerDevelopmentPlan } from "@/lib/coaching/player-development";
import { withOrganizationContext } from "@/lib/tenant-context";

// P15 C1 remainder (I2 first slice): adopting, superseding and reading a player's CoachingPlan.
//
// The engine (src/lib/coaching/player-development.ts) is pure and its output is a function of the
// season's box scores - so the CALLER rebuilds the plan and passes it here; the snapshot is frozen
// inside this module and never re-derived on read. A coach's commitment must not silently change
// because more games were played.

export const COACHING_PLAN_ADOPTED_AUDIT_ACTION = "COACHING_PLAN_ADOPTED";
export const COACHING_PLAN_SUPERSEDED_AUDIT_ACTION = "COACHING_PLAN_SUPERSEDED";

export type AdoptCoachingPlanArgs = {
  organizationId: string;
  userId: string;
  seasonClubId: string;
  playerId: string;
  plan: PlayerDevelopmentPlan;
  note?: string | null;
};

export type AdoptCoachingPlanResult =
  | { ok: true; planId: string; supersededPlanId: string | null }
  | { ok: false; error: "PLAYER_NOT_ON_ROSTER" | "PLAN_NOT_ADOPTABLE" };

// One transaction, in this order (the order matters because of the partial unique index
// CoachingPlan_one_active_per_player): close the current ACTIVE row first, then insert the new one.
// Inserting first would collide with the still-ACTIVE row and fail the index.
export async function adoptCoachingPlan(tx: Prisma.TransactionClient, args: AdoptCoachingPlanArgs): Promise<AdoptCoachingPlanResult> {
  const { organizationId, userId, seasonClubId, playerId, plan, note } = args;

  // The player must belong to the club named in the route, inside this organization. The composite
  // FK would also reject a cross-tenant row, but this gives the caller a specific error instead of a
  // constraint violation, and it catches "right org, wrong club" which the FK does not.
  const player = await tx.player.findFirst({
    where: { id: playerId, organizationId, seasonClubId },
    select: { id: true },
  });
  if (!player) return { ok: false, error: "PLAYER_NOT_ON_ROSTER" };

  // Refuse to record a commitment to nothing: an INSUFFICIENT_DATA plan has no focus areas, and a
  // plan built for a different player/club must never be stored under this one.
  if (!isAdoptablePlan(plan) || plan.playerId !== playerId || plan.seasonClubId !== seasonClubId) {
    return { ok: false, error: "PLAN_NOT_ADOPTABLE" };
  }

  const snapshot: CoachingPlanSnapshot = buildCoachingPlanSnapshot(plan);

  const current = await tx.coachingPlan.findFirst({
    where: { organizationId, playerId, status: "ACTIVE" },
    select: { id: true },
  });

  if (current) {
    await tx.coachingPlan.update({
      where: { id: current.id },
      data: { status: "SUPERSEDED", closedAt: new Date() },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId,
      action: COACHING_PLAN_SUPERSEDED_AUDIT_ACTION,
      entityType: "CoachingPlan",
      entityId: current.id,
      details: { playerId, seasonClubId, supersededByUserId: userId },
    });
  }

  const created = await tx.coachingPlan.create({
    data: {
      organizationId,
      playerId,
      seasonClubId,
      status: "ACTIVE",
      planVersion: snapshot.version,
      focusAreas: snapshot as unknown as Prisma.InputJsonValue,
      reviewWindowGames: snapshot.reviewWindowGames || 0,
      note: note?.trim() ? note.trim().slice(0, 500) : null,
      adoptedById: userId,
      supersedesId: current?.id ?? null,
    },
    select: { id: true },
  });

  await writeAuditLog(tx, {
    organizationId,
    userId,
    action: COACHING_PLAN_ADOPTED_AUDIT_ACTION,
    entityType: "CoachingPlan",
    entityId: created.id,
    details: {
      playerId,
      seasonClubId,
      planVersion: snapshot.version,
      reviewWindowGames: snapshot.reviewWindowGames,
      focusAreas: snapshot.focusAreas.map((area) => area.dimension),
      supersedesPlanId: current?.id ?? null,
    },
  });

  return { ok: true, planId: created.id, supersededPlanId: current?.id ?? null };
}

export type AdoptedCoachingPlan = {
  id: string;
  status: string;
  planVersion: string;
  adoptedAt: Date;
  adoptedByName: string | null;
  note: string | null;
  reviewWindowGames: number;
  snapshot: CoachingPlanSnapshot | null;
};

// Read path for the player page. A snapshot this code cannot parse is returned as `snapshot: null`
// with the row still present, so the page can say "adopted, but unreadable by this version" instead
// of pretending nothing was adopted.
//
// `client` is injectable so this can be tested against an isolated schema - see
// withOrganizationContext's own comment on why the global singleton is wrong there.
export async function loadActiveCoachingPlan(organizationId: string, playerId: string, client?: PrismaClient): Promise<AdoptedCoachingPlan | null> {
  return withOrganizationContext(
    organizationId,
    async (tx) => {
      const row = await tx.coachingPlan.findFirst({
        where: { organizationId, playerId, status: "ACTIVE" },
        select: {
          id: true,
          status: true,
          planVersion: true,
          adoptedAt: true,
          note: true,
          reviewWindowGames: true,
          focusAreas: true,
          adoptedBy: { select: { name: true, email: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        planVersion: row.planVersion,
        adoptedAt: row.adoptedAt,
        adoptedByName: row.adoptedBy.name ?? row.adoptedBy.email ?? null,
        note: row.note,
        reviewWindowGames: row.reviewWindowGames,
        snapshot: parseCoachingPlanSnapshot(row.focusAreas),
      };
    },
    client,
  );
}

// How many plans this player has ever had, so the page can offer history without a second query
// shape. Deliberately a count, not a list: nothing renders the old snapshots yet.
export async function countCoachingPlanHistory(organizationId: string, playerId: string, client?: PrismaClient): Promise<number> {
  return withOrganizationContext(organizationId, (tx) => tx.coachingPlan.count({ where: { organizationId, playerId } }), client);
}
