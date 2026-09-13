import type { RegistrationHost } from "../host";
import { UltraLeagueOsRegistrationHost } from "./ultra-league-os";

// The registration experience is DB-backed: getRegistrationHost() always returns
// the Ultra League OS adapter, which delegates to the tenant-scoped service layer.
// The former in-memory adapter (selected via REGISTRATION_PERSISTENCE=memory) has
// been retired now that the R1/R2 migrations are applied to the target database.
export function getRegistrationHost(): RegistrationHost {
  return new UltraLeagueOsRegistrationHost();
}

export { UltraLeagueOsRegistrationHost } from "./ultra-league-os";
