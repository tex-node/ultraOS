// Single authoritative entry point for the confirmed sport rules and their
// enforcement. Admin configuration, the public form, server-side submission
// validation, seeds, and tests all import from here so the numeric rules live in
// exactly one place (sport-config-admin / validation).

export {
  VOLLEYBALL_ROSTER,
  FLAG_RACE_ROSTER,
  SPORT_CONFIG_PRESETS,
  buildAllFemaleTeamCompetitionConfig,
  sportConfigFormSchema,
  parseSportConfigForm,
  planSportConfigSeed,
  describeRoster,
} from "./sport-config-admin";
export type { SeedPlanAction, SportConfigPresetName } from "./sport-config-admin";

export { validateTeamSubmission, validateFieldAnswers } from "./validation";
export type { TeamSubmissionInput, ParticipantInput, ValidationIssue, RegistrationFieldDef } from "./validation";

export { parseSportConfig, sportConfigSchema, rosterFor, ageInYears } from "./sport-config";
export type { SportConfig, SportRosterConfig } from "./sport-config";
