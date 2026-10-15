import { coachingAccessReason, type CoachingAccessReason, type CoachingScope, type CoachingViewer } from "./access";

// The single decision every /coaching page makes before it renders anything. Anything short of a
// positive access reason is NOT_FOUND, so a page never reveals that it exists (ADR-011 rule 1):
// feature flag off, anonymous, unknown club, and a coach of some other club all look identical.
export type CoachingPageDecision = Exclude<CoachingAccessReason, "NONE"> | "NOT_FOUND";

export function coachingPageDecision(input: {
  flagEnabled: boolean;
  viewer: CoachingViewer | null | undefined;
  scope: CoachingScope | null | undefined;
}): CoachingPageDecision {
  if (!input.flagEnabled || !input.viewer || !input.scope) return "NOT_FOUND";
  const reason = coachingAccessReason(input.viewer, input.scope);
  return reason === "NONE" ? "NOT_FOUND" : reason;
}
