// ADR-011: the Coaching Assistant ships dark. Server-side only (no NEXT_PUBLIC_ prefix): coaching
// pages are server components and the flag must never be readable from a public bundle.
export const COACHING_ASSISTANT_ENV_KEY = "COACHING_ASSISTANT_ENABLED" as const;

export function isCoachingAssistantEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[COACHING_ASSISTANT_ENV_KEY] === "true";
}
