// Game-control access.
//
// One place that answers "may this user operate this game?". Access comes from GameControlGrant rows,
// which are scoped to a competition (tournament), a season, an event, or the whole organization (no
// scope). Org-wide roles (OFFICIAL / LEAGUE_OPERATOR) are checked separately by the authorization
// helpers - this module is only about the scoped grants.
//
// Pure resolution lives here (grantApplies / hasGameControlPermission) so it can be tested without a
// database; the reader at the bottom is the thin DB wrapper.

import type { Permission } from "@/lib/permissions";

export const GAME_CONTROL_PERMISSIONS = {
  // Runs one tournament end to end: schedule tweaks, scoring, and confirming results.
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

export type GameControlRoleKey = keyof typeof GAME_CONTROL_PERMISSIONS;

export const GAME_CONTROL_ROLE_LABELS: Record<GameControlRoleKey, string> = {
  EVENT_ADMIN: "Tournament admin",
  GAME_CONTROLLER: "Game controller",
  SCOREKEEPER: "Scorekeeper",
  STATISTICIAN: "Statistician",
};

export const GAME_CONTROL_ROLE_LIST: GameControlRoleKey[] = Object.keys(GAME_CONTROL_PERMISSIONS) as GameControlRoleKey[];

// Stored uppercase; tolerate case/whitespace so a hand-typed row still matches.
export function normalizeGameControlRole(role: string | null | undefined): GameControlRoleKey | null {
  if (!role) return null;
  const key = role.trim().toUpperCase() as GameControlRoleKey;
  return key in GAME_CONTROL_PERMISSIONS ? key : null;
}

export function isGameControlRole(role: string | null | undefined): role is GameControlRoleKey {
  return normalizeGameControlRole(role) !== null;
}

export function gameControlRoleLabel(role: string | null | undefined): string | null {
  const normalized = normalizeGameControlRole(role);
  return normalized ? GAME_CONTROL_ROLE_LABELS[normalized] : null;
}

export function gameControlRoleGrants(role: string | null | undefined, permission: Permission): boolean {
  const normalized = normalizeGameControlRole(role);
  if (!normalized) return false;
  return (GAME_CONTROL_PERMISSIONS[normalized] as readonly Permission[]).includes(permission);
}

export function gameControlRolesGrant(roles: string[], permission: Permission): boolean {
  return roles.some((role) => gameControlRoleGrants(role, permission));
}

export type GrantScope = {
  competitionId?: string | null;
  seasonId?: string | null;
  eventId?: string | null;
};

export type GameControlGrantLike = {
  role: string;
  competitionId: string | null;
  seasonId: string | null;
  eventId: string | null;
  revokedAt: Date | null;
};

// An active grant applies when its role grants the permission AND its scope matches the target. A
// grant with no scope at all is organization-wide and always matches.
export function grantApplies(
  grant: GameControlGrantLike,
  scope: GrantScope,
  permission: Permission,
): boolean {
  if (grant.revokedAt) return false;
  if (!gameControlRoleGrants(grant.role, permission)) return false;

  const organizationWide = !grant.competitionId && !grant.seasonId && !grant.eventId;
  if (organizationWide) return true;

  if (grant.competitionId) return Boolean(scope.competitionId) && grant.competitionId === scope.competitionId;
  if (grant.seasonId) return Boolean(scope.seasonId) && grant.seasonId === scope.seasonId;
  return Boolean(scope.eventId) && grant.eventId === scope.eventId;
}

export function hasGameControlPermission(
  grants: GameControlGrantLike[],
  scope: GrantScope,
  permission: Permission,
): boolean {
  return grants.some((grant) => grantApplies(grant, scope, permission));
}

// Parses a dashboard scope value: "org" | "competition:<id>" | "season:<id>" | "event:<id>".
// Returns null for anything unrecognised so the caller can reject it.
export function parseGrantScope(value: string): (GrantScope & { competitionId: string | null; seasonId: string | null; eventId: string | null }) | null {
  if (value === "org") return { competitionId: null, seasonId: null, eventId: null };
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  if (kind === "competition") return { competitionId: id, seasonId: null, eventId: null };
  if (kind === "season") return { competitionId: null, seasonId: id, eventId: null };
  if (kind === "event") return { competitionId: null, seasonId: null, eventId: id };
  return null;
}

export type GameControlGrantReader = {
  gameControlGrant: {
    findMany(args: {
      where: { userId: string; organizationId: string; revokedAt: null };
      select: {
        role: true;
        competitionId: true;
        seasonId: true;
        eventId: true;
        revokedAt: true;
      };
    }): Promise<GameControlGrantLike[]>;
  };
};

export async function userHasGameControlPermission(
  userId: string,
  organizationId: string,
  scope: GrantScope,
  permission: Permission,
  db: GameControlGrantReader,
): Promise<boolean> {
  const grants = await db.gameControlGrant.findMany({
    where: { userId, organizationId, revokedAt: null },
    select: { role: true, competitionId: true, seasonId: true, eventId: true, revokedAt: true },
  });
  return hasGameControlPermission(grants, scope, permission);
}
