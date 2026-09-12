import type { RegistrationHost } from "../host";
import { InMemoryRegistrationHost } from "./in-memory";
import { UltraLeagueOsRegistrationHost } from "./ultra-league-os";

export type RegistrationHostKind = "ultraos" | "memory";

// Single shared in-memory instance for local/dev and tests.
export const inMemoryRegistrationHost = new InMemoryRegistrationHost();

export function getRegistrationHost(kind?: RegistrationHostKind): RegistrationHost {
  const resolved = kind ?? (process.env.REGISTRATION_PERSISTENCE === "memory" ? "memory" : "ultraos");
  return resolved === "memory" ? inMemoryRegistrationHost : new UltraLeagueOsRegistrationHost();
}

export { InMemoryRegistrationHost } from "./in-memory";
export { UltraLeagueOsRegistrationHost } from "./ultra-league-os";
