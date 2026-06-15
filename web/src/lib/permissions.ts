import type { UserRole } from "@/generated/prisma/enums";

export type Permission =
  | "season:manage"
  | "club:manage"
  | "player:manage"
  | "staff:manage"
  | "draft:manage"
  | "fixture:manage"
  | "game:operate"
  | "result:confirm"
  | "audit:view"
  | "club:view-assigned"
  | "roster:view"
  | "availability:submit"
  | "stats:view"
  | "scout-note:manage"
  | "fan-club:join"
  | "mvp:vote"
  | "public:view";

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([
    "season:manage",
    "club:manage",
    "player:manage",
    "staff:manage",
    "draft:manage",
    "fixture:manage",
    "game:operate",
    "result:confirm",
    "audit:view",
    "club:view-assigned",
    "roster:view",
    "availability:submit",
    "stats:view",
    "scout-note:manage",
    "fan-club:join",
    "mvp:vote",
    "public:view",
  ]),
  LEAGUE_OPERATOR: new Set<Permission>([
    "fixture:manage",
    "game:operate",
    "result:confirm",
    "audit:view",
    "roster:view",
    "stats:view",
    "public:view",
  ]),
  TEAM_MANAGER: new Set<Permission>([
    "club:view-assigned",
    "roster:view",
    "availability:submit",
    "stats:view",
    "public:view",
  ]),
  COACH: new Set<Permission>([
    "club:view-assigned",
    "roster:view",
    "stats:view",
    "public:view",
  ]),
  SCOUT: new Set<Permission>([
    "stats:view",
    "scout-note:manage",
    "public:view",
  ]),
  FAN: new Set<Permission>(["fan-club:join", "mvp:vote", "public:view"]),
};

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].has(permission);
}
