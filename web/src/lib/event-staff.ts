// Event-scoped staff roles.
//
// Game-day staff (a game controller, scorekeeper or statistician) are usually not league-wide
// operators: they should be able to run one event's games without gaining those permissions across
// the whole organization. An EventStaffAssignment row scoped to (organizationId, eventId, userId)
// grants exactly the permissions of its role, for that event's fixtures only.
//
// The `role` column is free text (the staff planner stores display labels like "MC"), so only the
// known keys below ever grant anything - anything else is inert.

import type { Permission } from "@/lib/permissions";

export const EVENT_STAFF_PERMISSIONS = {
  // Runs one event end to end: schedule tweaks, scoring, and confirming results.
  EVENT_ADMIN: [
    "fixture:manage",
    "game:operate",
    "game:record-stats",
    "result:confirm",
    "stats:view",
    "public:view",
  ],
  // The person on the table: scores and confirms the game, but cannot change the schedule.
  GAME_CONTROLLER: ["game:operate", "game:record-stats", "result:confirm", "stats:view", "public:view"],
  // Scores the game; the result is confirmed by someone else.
  SCOREKEEPER: ["game:operate", "game:record-stats", "stats:view", "public:view"],
  // Player-level statistics only - no scoreline entry.
  STATISTICIAN: ["game:record-stats", "stats:view", "public:view"],
} as const satisfies Record<string, readonly Permission[]>;

export type EventStaffRole = keyof typeof EVENT_STAFF_PERMISSIONS;

export const EVENT_STAFF_ROLE_LABELS: Record<EventStaffRole, string> = {
  EVENT_ADMIN: "Event admin",
  GAME_CONTROLLER: "Game controller",
  SCOREKEEPER: "Scorekeeper",
  STATISTICIAN: "Statistician",
};

export const EVENT_STAFF_ROLE_LIST: EventStaffRole[] = Object.keys(EVENT_STAFF_PERMISSIONS) as EventStaffRole[];

// Roles are stored uppercase; tolerate surrounding whitespace/case so a hand-typed row still matches.
export function normalizeEventStaffRole(role: string | null | undefined): EventStaffRole | null {
  if (!role) return null;
  const key = role.trim().toUpperCase() as EventStaffRole;
  return key in EVENT_STAFF_PERMISSIONS ? key : null;
}

export function isEventStaffRole(role: string | null | undefined): role is EventStaffRole {
  return normalizeEventStaffRole(role) !== null;
}

// Display label for a stored role, or null when the row is not a permission-bearing role (the staff
// planner also stores free-text labels like "MC").
export function eventStaffRoleLabel(role: string | null | undefined): string | null {
  const normalized = normalizeEventStaffRole(role);
  return normalized ? EVENT_STAFF_ROLE_LABELS[normalized] : null;
}

export function eventStaffRoleGrants(role: string | null | undefined, permission: Permission): boolean {
  const normalized = normalizeEventStaffRole(role);
  if (!normalized) return false;
  return (EVENT_STAFF_PERMISSIONS[normalized] as readonly Permission[]).includes(permission);
}

export function eventStaffRolesGrant(roles: string[], permission: Permission): boolean {
  return roles.some((role) => eventStaffRoleGrants(role, permission));
}

// A cancelled assignment is the revocation path (the row is kept for audit).
export const ACTIVE_EVENT_STAFF_STATUS = { not: "CANCELLED" } as const;

export type EventStaffGrantReader = {
  eventStaffAssignment: {
    findMany(args: {
      where: { userId: string; eventId: string; organizationId: string; status: { not: "CANCELLED" } };
      select: { role: true };
    }): Promise<{ role: string }[]>;
  };
};

// Does this user hold an event-scoped role at this event that grants the permission? Never a
// substitute for RLS - the caller scopes to its own organization.
export async function userHasEventPermission(
  userId: string,
  organizationId: string,
  eventId: string,
  permission: Permission,
  db: EventStaffGrantReader,
): Promise<boolean> {
  const assignments = await db.eventStaffAssignment.findMany({
    where: { userId, eventId, organizationId, status: ACTIVE_EVENT_STAFF_STATUS },
    select: { role: true },
  });
  return eventStaffRolesGrant(
    assignments.map((assignment) => assignment.role),
    permission,
  );
}
