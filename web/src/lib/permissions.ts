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
  | "application:review"
  | "event:manage"
  | "accreditation:manage"
  | "check-in:operate"
  | "reservation:manage"
  | "vendor:manage"
  | "order:manage"
  | "content:manage"
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
    "application:review",
    "event:manage",
    "accreditation:manage",
    "check-in:operate",
    "reservation:manage",
    "vendor:manage",
    "order:manage",
    "content:manage",
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
    "application:review",
    "event:manage",
    "accreditation:manage",
    "check-in:operate",
    "reservation:manage",
    "vendor:manage",
    "order:manage",
    "content:manage",
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
  PLAYER: new Set<Permission>([
    "roster:view",
    "availability:submit",
    "stats:view",
    "fan-club:join",
    "mvp:vote",
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
  OFFICIAL: new Set<Permission>([
    "fixture:manage",
    "game:operate",
    "stats:view",
    "public:view",
  ]),
  VENDOR: new Set<Permission>([
    "vendor:manage",
    "order:manage",
    "fan-club:join",
    "mvp:vote",
    "public:view",
  ]),
  MEDIA: new Set<Permission>([
    "accreditation:manage",
    "stats:view",
    "fan-club:join",
    "mvp:vote",
    "public:view",
  ]),
  VOLUNTEER: new Set<Permission>([
    "check-in:operate",
    "fan-club:join",
    "mvp:vote",
    "public:view",
  ]),
  FAN: new Set<Permission>(["fan-club:join", "mvp:vote", "public:view"]),
};

export function normalizeRoles(roles: UserRole | UserRole[] | undefined) {
  const normalized = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return normalized.includes("FAN") ? normalized : [...normalized, "FAN" as UserRole];
}

export function hasPermission(roles: UserRole | UserRole[] | undefined, permission: Permission) {
  return normalizeRoles(roles).some((role) => rolePermissions[role]?.has(permission));
}

export function primaryRole(roles: UserRole[] | undefined): UserRole {
  const rank: UserRole[] = [
    "SUPER_ADMIN",
    "LEAGUE_OPERATOR",
    "TEAM_MANAGER",
    "COACH",
    "SCOUT",
    "OFFICIAL",
    "PLAYER",
    "VENDOR",
    "MEDIA",
    "VOLUNTEER",
    "FAN",
  ];
  const normalized = normalizeRoles(roles);
  return rank.find((role) => normalized.includes(role)) ?? "FAN";
}
