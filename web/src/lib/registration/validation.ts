import { ageInYears, rosterFor, type SportConfig, type RegistrationSportValue } from "./sport-config";
import { participantMatchKey } from "./normalization";

export type RegistrationFieldTypeName =
  | "TEXT" | "TEXTAREA" | "EMAIL" | "PHONE" | "NUMBER" | "DATE"
  | "SELECT" | "MULTISELECT" | "CHECKBOX" | "CONSENT";

export type RegistrationFieldDef = {
  key: string;
  label: string;
  type: RegistrationFieldTypeName;
  scope: "SUBMISSION" | "PARTICIPANT";
  required: boolean;
  options?: string[] | null;
  conditionalOn?: { key: string; equals?: unknown } | null;
};

export type ValidationIssue = { path: string; code: string; message: string };
export type ValidationResult = { valid: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] };

export type SportMembershipInput = {
  sport: RegistrationSportValue;
  rosterOrder?: number | null;
  position?: string | null;
  isActive?: boolean;
  isCaptain?: boolean;
};

export type ParticipantInput = {
  clientId: string;
  fullName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  consentAccepted?: boolean;
  athleteId?: string | null;
  sportMemberships: SportMembershipInput[];
};

export type TeamSubmissionInput = {
  teamName?: string | null;
  teamClubOrSchool?: string | null;
  teamCategory?: string | null;
  participants: ParticipantInput[];
};

export type ValidateOptions = {
  config: SportConfig;
  now?: Date;
  // true = final submission (complete rosters required); false = save as draft.
  requireCompleteRosters: boolean;
  // Match keys of participants already registered to OTHER teams in the SAME event.
  existingMatchKeys?: Set<string>;
};

function empty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

export function validateFieldAnswers(
  fields: RegistrationFieldDef[],
  answers: Record<string, unknown>,
  scope: "SUBMISSION" | "PARTICIPANT",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = new Set(fields.map((field) => field.key));
  for (const field of fields) {
    if (field.scope !== scope) continue;
    const condition = field.conditionalOn;
    if (condition && answers[condition.key] !== condition.equals) continue; // hidden
    const value = answers[field.key];
    if (field.required && empty(value)) {
      issues.push({ path: field.key, code: "REQUIRED", message: `${field.label} is required.` });
      continue;
    }
    if (empty(value)) continue;
    switch (field.type) {
      case "EMAIL":
        if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) issues.push({ path: field.key, code: "INVALID_EMAIL", message: `${field.label} must be a valid email.` });
        break;
      case "PHONE": {
        const digits = String(value).replace(/\D/g, "");
        if (digits.length < 7 || digits.length > 15) issues.push({ path: field.key, code: "INVALID_PHONE", message: `${field.label} must be a valid phone number.` });
        break;
      }
      case "NUMBER":
        if (Number.isNaN(Number(value))) issues.push({ path: field.key, code: "INVALID_NUMBER", message: `${field.label} must be a number.` });
        break;
      case "DATE":
        if (Number.isNaN(new Date(String(value)).getTime())) issues.push({ path: field.key, code: "INVALID_DATE", message: `${field.label} must be a valid date.` });
        break;
      case "SELECT":
        if (Array.isArray(field.options) && !field.options.includes(String(value))) issues.push({ path: field.key, code: "INVALID_OPTION", message: `${field.label} has an invalid selection.` });
        break;
      case "MULTISELECT": {
        const list = Array.isArray(value) ? value.map(String) : [];
        if (Array.isArray(field.options) && list.some((item) => !field.options!.includes(item))) issues.push({ path: field.key, code: "INVALID_OPTION", message: `${field.label} has an invalid selection.` });
        break;
      }
      case "CONSENT":
        if (value !== true) issues.push({ path: field.key, code: "CONSENT_REQUIRED", message: `${field.label} must be accepted.` });
        break;
      default:
        break;
    }
  }
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) issues.push({ path: key, code: "UNKNOWN_FIELD", message: `Unknown field "${key}".` });
  }
  return issues;
}

export function validateTeamSubmission(input: TeamSubmissionInput, options: ValidateOptions): ValidationResult {
  const { config, requireCompleteRosters } = options;
  const now = options.now ?? new Date();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const sports = [...new Set(config.sports)];

  if (empty(input.teamName)) {
    (requireCompleteRosters ? errors : warnings).push({ path: "teamName", code: "TEAM_NAME", message: "Team name is required." });
  }
  if (input.participants.length === 0) {
    (requireCompleteRosters ? errors : warnings).push({ path: "participants", code: "EMPTY_TEAM", message: "At least one participant is required." });
  }

  const seenInSubmission = new Map<string, string>();
  for (const participant of input.participants) {
    const base = `participants.${participant.clientId}`;
    if (empty(participant.fullName)) errors.push({ path: `${base}.fullName`, code: "REQUIRED", message: "Full name is required." });

    if (config.gender !== "ANY") {
      if (empty(participant.gender)) errors.push({ path: `${base}.gender`, code: "GENDER_REQUIRED", message: "Gender is required for eligibility." });
      else if (String(participant.gender).toUpperCase() !== config.gender) errors.push({ path: `${base}.gender`, code: "GENDER_INELIGIBLE", message: `This competition is ${config.gender.toLowerCase()}-only.` });
    }

    if (empty(participant.dateOfBirth)) {
      errors.push({ path: `${base}.dateOfBirth`, code: "DOB_REQUIRED", message: "Date of birth is required for age eligibility." });
    } else {
      const age = ageInYears(String(participant.dateOfBirth), now);
      if (age < config.minAge || age > config.maxAge) errors.push({ path: `${base}.dateOfBirth`, code: "AGE_INELIGIBLE", message: `Age ${age} is outside the configured ${config.minAge}-${config.maxAge} range.` });
    }

    if (config.requireGuardianConsent) {
      if (empty(participant.guardianName)) (requireCompleteRosters ? errors : warnings).push({ path: `${base}.guardianName`, code: "GUARDIAN_REQUIRED", message: "Guardian name is required." });
      if (empty(participant.guardianPhone)) (requireCompleteRosters ? errors : warnings).push({ path: `${base}.guardianPhone`, code: "GUARDIAN_REQUIRED", message: "Guardian phone is required." });
      if (participant.consentAccepted !== true) (requireCompleteRosters ? errors : warnings).push({ path: `${base}.consentAccepted`, code: "CONSENT_REQUIRED", message: "Guardian consent is required for every child." });
    }

    if (participant.sportMemberships.length === 0) errors.push({ path: `${base}.sportMemberships`, code: "NO_SPORT", message: "Assign the child to at least one sport." });
    const memberSports = new Set(participant.sportMemberships.map((membership) => membership.sport));
    for (const membership of participant.sportMemberships) {
      if (!sports.includes(membership.sport)) errors.push({ path: `${base}.sportMemberships`, code: "SPORT_NOT_CONFIGURED", message: `${membership.sport} is not part of this competition.` });
    }
    if (memberSports.size > 1 && !config.dualParticipationAllowed) errors.push({ path: `${base}.sportMemberships`, code: "DUAL_NOT_ALLOWED", message: "This competition does not allow dual-sport participation." });

    const matchKey = participantMatchKey(participant.fullName, participant.dateOfBirth);
    if (matchKey) {
      const prior = seenInSubmission.get(matchKey);
      if (prior) errors.push({ path: `${base}.fullName`, code: "DUPLICATE_IN_SUBMISSION", message: `Possible duplicate of participant "${prior}" in this submission.` });
      else seenInSubmission.set(matchKey, participant.fullName);
      if (options.existingMatchKeys?.has(matchKey)) errors.push({ path: `${base}.fullName`, code: "DUPLICATE_IN_EVENT", message: "A participant with this name and date of birth is already registered to another team in this event. Manual review required." });
    }
  }

  // Team-level per-sport roster checks.
  for (const sport of sports) {
    const roster = rosterFor(config, sport);
    const members = input.participants.flatMap((participant) =>
      participant.sportMemberships.filter((membership) => membership.sport === sport).map((membership) => ({ participant, membership })),
    );
    const count = members.length;
    if (config.requireBothSports && requireCompleteRosters && count === 0) {
      errors.push({ path: `rosters.${sport}`, code: "ROSTER_MISSING", message: `A ${sport} roster is required.` });
    }
    if (!roster) {
      if (count > 0) warnings.push({ path: `rosters.${sport}`, code: "ROSTER_UNCONFIGURED", message: `No limits configured for ${sport}.` });
      continue;
    }
    if (requireCompleteRosters) {
      if (count < roster.minRoster) errors.push({ path: `rosters.${sport}`, code: "ROSTER_TOO_SMALL", message: `${sport} roster needs at least ${roster.minRoster} participants (has ${count}).` });
    } else if (count > 0 && count < roster.minRoster) {
      warnings.push({ path: `rosters.${sport}`, code: "ROSTER_INCOMPLETE", message: `${sport} roster is below the minimum of ${roster.minRoster} and can only be saved as a draft.` });
    }
    if (count > roster.maxRoster) errors.push({ path: `rosters.${sport}`, code: "ROSTER_TOO_LARGE", message: `${sport} roster allows at most ${roster.maxRoster} participants (has ${count}).` });
    if (!roster.substitutesAllowed && roster.activeCount !== undefined && count > roster.activeCount) {
      errors.push({ path: `rosters.${sport}`, code: "SUBSTITUTES_NOT_ALLOWED", message: `${sport} does not allow substitutes (max ${roster.activeCount}).` });
    }
    if (roster.activeCount !== undefined) {
      const active = members.filter(({ membership }) => membership.isActive !== false).length;
      if (requireCompleteRosters && count > 0 && active !== roster.activeCount) {
        errors.push({ path: `rosters.${sport}`, code: "ACTIVE_COUNT", message: `${sport} must mark exactly ${roster.activeCount} active participants (has ${active}).` });
      }
    }
    if (roster.orderRequired) {
      const orders = members.map(({ membership, participant }) => ({ order: membership.rosterOrder, name: participant.fullName }));
      if (requireCompleteRosters && orders.some((entry) => !entry.order || entry.order < 1)) {
        errors.push({ path: `rosters.${sport}`, code: "ORDER_REQUIRED", message: `A race order is required for every ${sport} participant.` });
      }
      const values = orders.map((entry) => entry.order).filter((value): value is number => typeof value === "number" && value > 0);
      if (new Set(values).size !== values.length) errors.push({ path: `rosters.${sport}`, code: "ORDER_DUPLICATE", message: `Race order must be unique within the ${sport} roster.` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
