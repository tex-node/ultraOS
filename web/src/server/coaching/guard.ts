import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import type { CoachingViewer } from "@/lib/coaching/access";
import { isCoachingAssistantEnabled } from "@/lib/coaching/feature-flag";
import { coachingPageDecision, type CoachingPageDecision } from "@/lib/coaching/page-access";
import { loadCoachingViewer } from "./viewer";
import { resolveClubScope, type ClubScope } from "./scope";

// Every /coaching page and action starts here. Flag off, anonymous, unknown club and no access all
// end in notFound(), identical to a route that does not exist (ADR-011 rule 1).

export const currentSession = cache(async () => {
  try {
    return await auth();
  } catch {
    return null;
  }
});

const currentViewer = cache(async (): Promise<CoachingViewer | null> => loadCoachingViewer(await currentSession()));

export async function requireCoachingViewer(): Promise<CoachingViewer> {
  if (!isCoachingAssistantEnabled()) notFound();
  const viewer = await currentViewer();
  // Signed OUT is not the same as missing (streak v20): the homepage now links "For coaches" to /coaching, and a 404 is
  // what a visitor without a session used to get - a dead end reached from a public page. They are sent to sign in and
  // returned to the hub. The flag being off stays a 404, because a dark stack should not advertise itself.
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent("/coaching")}`);
  return viewer;
}

export type CoachingClubAccess = { viewer: CoachingViewer; scope: ClubScope; access: Exclude<CoachingPageDecision, "NOT_FOUND">; userId: string | null };

export async function requireCoachingClub(seasonClubId: string): Promise<CoachingClubAccess> {
  if (!isCoachingAssistantEnabled()) notFound();
  const viewer = await currentViewer();
  if (!viewer) notFound();
  const scope = await resolveClubScope(seasonClubId);
  const decision = coachingPageDecision({
    flagEnabled: true,
    viewer,
    scope: scope ? { organizationId: scope.organizationId, seasonClubId: scope.seasonClubId } : null,
  });
  if (decision === "NOT_FOUND" || !scope) notFound();
  const session = await currentSession();
  return { viewer, scope, access: decision, userId: session?.user?.id ?? null };
}
