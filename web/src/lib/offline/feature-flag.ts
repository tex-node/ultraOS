export const OFFLINE_SCORING_ENV_KEY = "NEXT_PUBLIC_OFFLINE_SCORING_ENABLED" as const;

export function isOfflineScoringEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[OFFLINE_SCORING_ENV_KEY] === "true";
}
