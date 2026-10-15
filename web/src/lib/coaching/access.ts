import { hasInsightsAccess } from "@/lib/insights-access";

// ADR-011 access rules for the Coaching Assistant, as a pure decision over a plain viewer shape
// so every branch is unit-testable without a database. The DB loader that builds a
// CoachingViewer from a session lives with the pages that need it; this file only decides.

export type CoachingViewer = {
  email: string | null;
  // Active (non-revoked) UserRoleAssignment rows for this user.
  roleAssignments: readonly { role: string; organizationId: string | null }[];
  // SeasonClubs where this user's linked Staff record is head or assistant coach.
  coachedSeasonClubs: readonly { seasonClubId: string; organizationId: string }[];
};

export type CoachingScope = { organizationId: string; seasonClubId: string };

export type CoachingAccessReason = "SUPER_ADMIN" | "ORG_ADMIN" | "CLUB_COACH" | "INSIGHTS_OVERRIDE" | "NONE";

const ORG_ADMIN_ROLES = new Set(["LEAGUE_OPERATOR", "TOURNAMENT_DIRECTOR"]);

export function coachingAccessReason(viewer: CoachingViewer | null | undefined, scope: CoachingScope): CoachingAccessReason {
  if (!viewer) return "NONE";
  if (viewer.roleAssignments.some((a) => a.role === "SUPER_ADMIN")) return "SUPER_ADMIN";
  if (viewer.roleAssignments.some((a) => ORG_ADMIN_ROLES.has(a.role) && a.organizationId === scope.organizationId)) return "ORG_ADMIN";
  if (viewer.coachedSeasonClubs.some((c) => c.seasonClubId === scope.seasonClubId && c.organizationId === scope.organizationId)) return "CLUB_COACH";
  // Legacy single-account override from the LBCL Insights tab; kept so existing use keeps working.
  if (hasInsightsAccess(viewer.email)) return "INSIGHTS_OVERRIDE";
  return "NONE";
}

export function canViewCoaching(viewer: CoachingViewer | null | undefined, scope: CoachingScope): boolean {
  return coachingAccessReason(viewer, scope) !== "NONE";
}

// Clubs a coach can open directly from the hub without an admin role. Admins pick from the
// organization's clubs instead, so this only returns explicit coaching assignments.
export function coachedSeasonClubIds(viewer: CoachingViewer | null | undefined, organizationId: string): string[] {
  if (!viewer) return [];
  return viewer.coachedSeasonClubs.filter((c) => c.organizationId === organizationId).map((c) => c.seasonClubId);
}
