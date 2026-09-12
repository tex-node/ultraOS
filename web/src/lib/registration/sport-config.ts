import { z } from "zod";
import { RegistrationSport } from "@/generated/prisma/enums";

// Validated, per-event configuration. All numeric/eligibility rules live here so
// nothing is hardcoded per competition. Stored on RegistrationForm.sportConfig.
export const sportEnum = z.enum([RegistrationSport.VOLLEYBALL, RegistrationSport.FLAG_RACE]);
export type RegistrationSportValue = z.infer<typeof sportEnum>;

const rosterSchema = z
  .object({
    minRoster: z.number().int().min(0),
    maxRoster: z.number().int().min(1),
    // Volleyball: how many of the roster are "active" for play.
    activeCount: z.number().int().min(0).optional(),
    substitutesAllowed: z.boolean().default(true),
    // Flag Race: rosterOrder must be present and unique.
    orderRequired: z.boolean().default(false),
  })
  .refine((value) => value.maxRoster >= value.minRoster, { message: "maxRoster must be greater than or equal to minRoster" })
  .refine((value) => value.activeCount === undefined || value.activeCount <= value.maxRoster, { message: "activeCount must be less than or equal to maxRoster" });

export const sportConfigSchema = z.object({
  sports: z.array(sportEnum).min(1),
  // Every team must register a roster for each configured sport.
  requireBothSports: z.boolean().default(false),
  dualParticipationAllowed: z.boolean().default(true),
  minAge: z.number().int().min(0).default(0),
  maxAge: z.number().int().min(0).default(120),
  requireGuardianConsent: z.boolean().default(true),
  requireCompleteRosters: z.boolean().default(true),
  gender: z.enum(["FEMALE", "MALE", "ANY"]).default("FEMALE"),
  rosters: z
    .object({
      [RegistrationSport.VOLLEYBALL]: rosterSchema.optional(),
      [RegistrationSport.FLAG_RACE]: rosterSchema.optional(),
    })
    .default({}),
});

export type SportConfig = z.infer<typeof sportConfigSchema>;
export type SportRosterConfig = z.infer<typeof rosterSchema>;

export class SportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportConfigError";
  }
}

export function parseSportConfig(value: unknown): SportConfig {
  const result = sportConfigSchema.safeParse(value ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new SportConfigError(`Invalid sportConfig: ${first?.path.join(".") ?? "unknown"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

export function rosterFor(config: SportConfig, sport: RegistrationSportValue): SportRosterConfig | null {
  return config.rosters[sport] ?? null;
}

export function ageInYears(dateOfBirth: Date | string, now: Date = new Date()): number {
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}
