// Multi-sport Stage 7 (S7.3): definition-driven sport identity for registration.
//
// Bridges the legacy RegistrationSport enum to the code registry, so registration rules/rosters can
// be read from a SportDefinition instead of being hardcoded per sport. The enum stays authoritative
// for stored rows until a later cleanup stage.

import { RegistrationSport } from "@/generated/prisma/enums";
import { getSportDefinition } from "@/lib/sports/registry";
import type { SportDefinition } from "@/lib/sports/types";
import type { SportConfig, SportRosterConfig } from "./sport-config";

export const REGISTRATION_SPORT_SLUGS: Record<RegistrationSport, string> = {
  VOLLEYBALL: "volleyball",
  FLAG_RACE: "flag-race",
};

export function registrationSportSlug(sport: RegistrationSport): string {
  return REGISTRATION_SPORT_SLUGS[sport];
}

export function registrationSportFromSlug(slug: string): RegistrationSport | null {
  const entry = (Object.entries(REGISTRATION_SPORT_SLUGS) as [RegistrationSport, string][]).find(
    ([, value]) => value === slug,
  );
  return entry ? entry[0] : null;
}

export function registrationSportDefinition(sport: RegistrationSport): SportDefinition | null {
  return getSportDefinition(REGISTRATION_SPORT_SLUGS[sport]);
}

export function registrationSportLabel(sport: RegistrationSport): string {
  const definition = registrationSportDefinition(sport);
  if (definition) return definition.name;
  return sport
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ConfiguredSport = {
  sport: RegistrationSport;
  slug: string;
  label: string;
  definition: SportDefinition | null;
  roster: SportRosterConfig | null;
};

// Definition-driven view of a stored SportConfig: each configured sport with its resolved
// definition and roster rules. Safe when a sport has no registered definition (definition null).
export function configuredSports(config: SportConfig): ConfiguredSport[] {
  return config.sports.map((sport) => ({
    sport,
    slug: registrationSportSlug(sport),
    label: registrationSportLabel(sport),
    definition: registrationSportDefinition(sport),
    roster: config.rosters[sport] ?? null,
  }));
}
