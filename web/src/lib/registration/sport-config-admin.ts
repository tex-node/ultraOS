import { RegistrationSport } from "@/generated/prisma/enums";
import { sportConfigSchema, type SportConfig, type SportRosterConfig } from "./sport-config";

// Shared, reusable presets. These are DATA (merged into RegistrationForm.sportConfig),
// consumed by the existing validators/renderer - never a parallel config format.
export const VOLLEYBALL_ROSTER: SportRosterConfig = {
  minRoster: 8,
  maxRoster: 12,
  activeCount: 6,
  substitutesAllowed: true,
  orderRequired: false,
};

export const FLAG_RACE_ROSTER: SportRosterConfig = {
  minRoster: 6,
  maxRoster: 6,
  activeCount: 6,
  substitutesAllowed: false,
  orderRequired: true,
};

// The all-female children's competition: teams register both sports, dual
// participation allowed subject to validation, female-only, guardian consent.
export function buildAllFemaleTeamCompetitionConfig(): SportConfig {
  return sportConfigSchema.parse({
    sports: [RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE],
    requireBothSports: true,
    dualParticipationAllowed: true,
    minAge: 6,
    maxAge: 12,
    requireGuardianConsent: true,
    requireCompleteRosters: true,
    gender: "FEMALE",
    rosters: {
      [RegistrationSport.VOLLEYBALL]: VOLLEYBALL_ROSTER,
      [RegistrationSport.FLAG_RACE]: FLAG_RACE_ROSTER,
    },
  });
}

export const SPORT_CONFIG_PRESETS = {
  "all-female-vb-flag": { label: "All-female Volleyball + Flag Race", build: buildAllFemaleTeamCompetitionConfig },
} as const;

export type SportConfigPresetName = keyof typeof SPORT_CONFIG_PRESETS;

// Admin/server-authoritative cross-field rules. Applied when WRITING config (the
// builder + seed). Runtime reads keep using the permissive sportConfigSchema so
// already-stored configs stay readable.
export const sportConfigFormSchema = sportConfigSchema.superRefine((config, context) => {
  if (config.minAge > config.maxAge) {
    context.addIssue({ code: "custom", path: ["maxAge"], message: "Maximum age must be greater than or equal to minimum age." });
  }
  for (const sport of new Set(config.sports)) {
    const roster = config.rosters[sport];
    if (!roster) {
      context.addIssue({ code: "custom", path: ["rosters", sport], message: `Configure the ${sport} roster.` });
      continue;
    }
    if (roster.minRoster > roster.maxRoster) {
      context.addIssue({ code: "custom", path: ["rosters", sport, "minRoster"], message: "Minimum roster cannot exceed maximum roster." });
    }
    if (roster.activeCount !== undefined && roster.activeCount > roster.maxRoster) {
      context.addIssue({ code: "custom", path: ["rosters", sport, "activeCount"], message: "Active count cannot exceed maximum roster." });
    }
  }
  if (config.requireBothSports && new Set(config.sports).size < 2) {
    context.addIssue({ code: "custom", path: ["sports"], message: "Both sports must be enabled when a team must register both." });
  }
  const flagRace = config.rosters[RegistrationSport.FLAG_RACE];
  if (config.sports.includes(RegistrationSport.FLAG_RACE) && flagRace) {
    if (flagRace.minRoster !== 6 || flagRace.maxRoster !== 6) {
      context.addIssue({ code: "custom", path: ["rosters", RegistrationSport.FLAG_RACE, "maxRoster"], message: "Flag Race must have exactly 6 athletes (min and max 6)." });
    }
    if (flagRace.substitutesAllowed) {
      context.addIssue({ code: "custom", path: ["rosters", RegistrationSport.FLAG_RACE, "substitutesAllowed"], message: "Flag Race does not allow substitutions." });
    }
    if (!flagRace.orderRequired) {
      context.addIssue({ code: "custom", path: ["rosters", RegistrationSport.FLAG_RACE, "orderRequired"], message: "Flag Race requires athlete order." });
    }
  }
});

export function parseSportConfigForm(value: unknown): SportConfig {
  const result = sportConfigFormSchema.safeParse(value ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`Invalid sport configuration: ${first?.path.join(".") ?? "unknown"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

export type SeedPlanAction = "CREATE" | "UPDATE" | "SKIP";

// Idempotent, non-destructive seed planning. Empty/missing config is populated;
// an existing (possibly administrator-customized) config is preserved unless the
// caller explicitly opts into overwrite.
export function planSportConfigSeed(
  existing: unknown,
  preset: SportConfig,
  options: { overwrite?: boolean } = {},
): { action: SeedPlanAction; config: SportConfig; reason: string } {
  const configured = existing !== null && existing !== undefined && typeof existing === "object" && Array.isArray((existing as { sports?: unknown }).sports) && ((existing as { sports: unknown[] }).sports.length > 0);
  if (!configured) return { action: "CREATE", config: preset, reason: "No sport configuration present." };
  if (!options.overwrite) return { action: "SKIP", config: existing as SportConfig, reason: "Existing configuration preserved (pass overwrite to replace)." };
  return { action: "UPDATE", config: preset, reason: "Explicit overwrite requested." };
}

// Human-readable derived rules for the builder's read-only summary.
export function describeRoster(sport: string, roster: SportRosterConfig | undefined): string {
  if (!roster) return `${sport}: not configured`;
  const parts = [`${roster.minRoster}–${roster.maxRoster} athletes`];
  if (roster.activeCount !== undefined) parts.push(`${roster.activeCount} active`);
  parts.push(roster.substitutesAllowed ? "substitutes allowed" : "no substitutes");
  if (roster.orderRequired) parts.push("order required");
  return `${sport}: ${parts.join(", ")}`;
}
