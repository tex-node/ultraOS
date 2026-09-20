import type { UserRole } from "@/generated/prisma/enums";

export type Permission =
  | "season:manage"
  | "competition:manage"
  | "club:manage"
  | "player:manage"
  | "staff:manage"
  | "draft:manage"
  | "fixture:manage"
  | "game:operate"
  // Statistician console (G.15): player-attributed shot/rebound/assist/steal/block/turnover/
  // foul/substitution entry, independent of the scorer's own game:operate console. Granted
  // alongside game:operate to the same game-day roles - the separation is architectural (two
  // consoles, two event streams, reconciled against each other), not a distinct account type.
  | "game:record-stats"
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
  | "media:read"
  | "media:upload"
  | "media:manage"
  | "media:approve"
  | "media:delete"
  | "data:import"
  | "data:import:players"
  | "data:import:coaches"
  | "data:import:clubs"
  | "data:import:resolve"
  | "data:import:confirm"
  | "data:import:report"
  | "draft-event:read"
  | "draft-event:configure"
  | "draft-event:operate"
  | "draft-event:reveal"
  | "draft-event:confirm"
  | "draft-event:correct"
  | "draft-event:complete"
  | "draft-event:display"
  | "draft-squad:manage"
  | "draft-coach-pool:manage"
  | "operations:view"
  | "operations:manage"
  | "incident:manage"
  | "runbook:manage"
  | "equipment:manage"
  | "notification:manage"
  | "document:manage"
  | "training:read"
  | "training:manage"
  | "training:record"
  | "training:export"
  | "training:view-private-notes"
  | "data:readiness"
  | "club:view-assigned"
  | "roster:view"
  | "availability:submit"
  | "stats:view"
  // Broadcast Control Panel (G.19, Part XXII/XLII): selects/TAKEs/CLEARs which presentation
  // graphic is on Program. Deliberately narrower than "operations:manage" - it never touches
  // score/clock/stats/records/lineups, only what the audience currently sees, so a dedicated
  // permission (rather than reusing an existing broader one) keeps that boundary enforceable.
  | "broadcast:operate"
  // AI Vision domain (G.21): register game video, create timeline anchors, run/queue analysis,
  // review vision observations/matches. Deliberately one permission for the whole internal
  // vision workspace rather than several narrower ones - "do not build an ML platform" (Part XV)
  // applies to the permission surface too; this is read+write for the same small operator group
  // that already has broadcast:operate, not a public or player-facing capability.
  | "vision:manage"
  | "scout-note:manage"
  | "fan-club:join"
  | "mvp:vote"
  | "public:view"
  | "announcement:manage"
  | "well-wish:moderate";

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([
    "season:manage",
    "competition:manage",
    "club:manage",
    "player:manage",
    "staff:manage",
    "draft:manage",
    "fixture:manage",
    "game:operate",
    "game:record-stats",
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
    "media:read",
    "media:upload",
    "media:manage",
    "media:approve",
    "media:delete",
    "data:import",
    "data:import:players",
    "data:import:coaches",
    "data:import:clubs",
    "data:import:resolve",
    "data:import:confirm",
    "data:import:report",
    "draft-event:read",
    "draft-event:configure",
    "draft-event:operate",
    "draft-event:reveal",
    "draft-event:confirm",
    "draft-event:correct",
    "draft-event:complete",
    "draft-event:display",
    "draft-squad:manage",
    "draft-coach-pool:manage",
    "operations:view",
    "operations:manage",
    "incident:manage",
    "runbook:manage",
    "equipment:manage",
    "notification:manage",
    "document:manage",
    "training:read",
    "training:manage",
    "training:record",
    "training:export",
    "training:view-private-notes",
    "data:readiness",
    "club:view-assigned",
    "roster:view",
    "availability:submit",
    "stats:view",
    "broadcast:operate",
    "vision:manage",
    "scout-note:manage",
    "fan-club:join",
    "mvp:vote",
    "public:view",
    "announcement:manage",
    "well-wish:moderate",
  ]),
  LEAGUE_OPERATOR: new Set<Permission>([
    "competition:manage",
    "player:manage",
    "staff:manage",
    "draft:manage",
    "fixture:manage",
    "game:operate",
    "game:record-stats",
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
    "media:read",
    "media:upload",
    "media:manage",
    "media:approve",
    "data:import",
    "data:import:players",
    "data:import:coaches",
    "data:import:clubs",
    "data:import:resolve",
    "data:import:confirm",
    "data:import:report",
    "draft-event:read",
    "draft-event:configure",
    "draft-event:operate",
    "draft-event:reveal",
    "draft-event:confirm",
    "draft-event:complete",
    "draft-event:display",
    "draft-squad:manage",
    "draft-coach-pool:manage",
    "operations:view",
    "operations:manage",
    "incident:manage",
    "runbook:manage",
    "equipment:manage",
    "notification:manage",
    "document:manage",
    "training:read",
    "training:manage",
    "training:record",
    "training:export",
    "data:readiness",
    "roster:view",
    "stats:view",
    "broadcast:operate",
    "vision:manage",
    "public:view",
    "announcement:manage",
    "well-wish:moderate",
  ]),
  TEAM_MANAGER: new Set<Permission>([
    "club:view-assigned",
    "roster:view",
    "availability:submit",
    "stats:view",
    "training:read",
    "training:record",
    "public:view",
  ]),
  // Tournament director (F6): runs scheduling, scoring, standings, ticketing and publishing
  // for their tournaments — everything operational except staff/admin/system management.
  TOURNAMENT_DIRECTOR: new Set<Permission>([
    "competition:manage",
    "fixture:manage",
    "game:operate",
    "game:record-stats",
    "result:confirm",
    "event:manage",
    "reservation:manage",
    "draft-event:operate",
    "draft-event:display",
    "content:manage",
    "announcement:manage",
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
    "training:read",
    "training:record",
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
    "game:record-stats",
    "result:confirm",
    "stats:view",
    "public:view",
  ]),
  // Scorekeeper (F6): active match pads only — no finalization, no management. Named
  // distinctly from the GameControlGrant SCOREKEEPER grant role (competition-scoped game
  // control); this is the organization-level role granting the same consoles league-wide.
  SCOREKEEPER: new Set<Permission>(["game:operate", "game:record-stats", "stats:view", "public:view"]),
  VENDOR: new Set<Permission>([
    "vendor:manage",
    "order:manage",
    "fan-club:join",
    "mvp:vote",
    "public:view",
  ]),
  // Vendor manager (F6): runs stalls, orders and menu availability — staff-side, without
  // the VENDOR account's fan-surface extras.
  VENDOR_MANAGER: new Set<Permission>(["vendor:manage", "order:manage", "public:view"]),
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
  // Gate staff (F4): validate tickets/QR codes at venue entry — nothing else. Narrower than
  // VOLUNTEER on purpose (no fan-club/mvp fan surface), so a gate device account cannot vote.
  GATE_MANAGER: new Set<Permission>(["check-in:operate", "public:view"]),
  FAN: new Set<Permission>(["fan-club:join", "mvp:vote", "public:view"]),
};

export function normalizeRoles(roles: UserRole | UserRole[] | undefined) {
  const normalized = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return normalized.includes("FAN") ? normalized : [...normalized, "FAN" as UserRole];
}

export function hasPermission(roles: UserRole | UserRole[] | undefined, permission: Permission) {
  return normalizeRoles(roles).some((role) => rolePermissions[role]?.has(permission));
}

export function roleGrantsPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role]?.has(permission) ?? false;
}

export function primaryRole(roles: UserRole[] | undefined): UserRole {
  const rank: UserRole[] = [
    "SUPER_ADMIN",
    "LEAGUE_OPERATOR",
    "TOURNAMENT_DIRECTOR",
    "TEAM_MANAGER",
    "COACH",
    "SCOUT",
    "OFFICIAL",
    "SCOREKEEPER",
    "PLAYER",
    "VENDOR",
    "VENDOR_MANAGER",
    "MEDIA",
    "VOLUNTEER",
    "GATE_MANAGER",
    "FAN",
  ];
  const normalized = normalizeRoles(roles);
  return rank.find((role) => normalized.includes(role)) ?? "FAN";
}
