// Competition format resolution.
//
// A division may override its competition's format and group count; NULL means "inherit". Every read
// path must resolve through this helper so the override and the default can never drift apart.

export const COMPETITION_FORMATS = ["ROUND_ROBIN", "KNOCKOUT", "GROUP_STAGE"] as const;
export type CompetitionFormatValue = (typeof COMPETITION_FORMATS)[number];

export const DEFAULT_FORMAT: CompetitionFormatValue = "ROUND_ROBIN";
export const DEFAULT_GROUP_COUNT = 2;
export const MIN_GROUP_COUNT = 2;
export const MAX_GROUP_COUNT = 16;

export function isCompetitionFormat(value: string | null | undefined): value is CompetitionFormatValue {
  return value === "ROUND_ROBIN" || value === "KNOCKOUT" || value === "GROUP_STAGE";
}

// Clamp a stored/requested group count into the supported range, falling back to the default.
export function normalizeGroupCount(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_GROUP_COUNT;
  const whole = Math.trunc(value);
  if (whole < MIN_GROUP_COUNT) return MIN_GROUP_COUNT;
  if (whole > MAX_GROUP_COUNT) return MAX_GROUP_COUNT;
  return whole;
}

export type FormatResolution = {
  format: CompetitionFormatValue;
  groupCount: number;
  // Which level supplied the format - handy for explaining the value in the UI.
  source: "DIVISION" | "COMPETITION" | "DEFAULT";
};

export function resolveFormat(input: {
  divisionFormat?: string | null;
  competitionFormat?: string | null;
  divisionGroupCount?: number | null;
  competitionGroupCount?: number | null;
}): FormatResolution {
  if (isCompetitionFormat(input.divisionFormat)) {
    return {
      format: input.divisionFormat,
      groupCount: normalizeGroupCount(input.divisionGroupCount ?? input.competitionGroupCount),
      source: "DIVISION",
    };
  }
  if (isCompetitionFormat(input.competitionFormat)) {
    return {
      format: input.competitionFormat,
      groupCount: normalizeGroupCount(input.divisionGroupCount ?? input.competitionGroupCount),
      source: "COMPETITION",
    };
  }
  return {
    format: DEFAULT_FORMAT,
    groupCount: normalizeGroupCount(input.divisionGroupCount ?? input.competitionGroupCount),
    source: "DEFAULT",
  };
}

export function formatLabel(format: CompetitionFormatValue): string {
  if (format === "KNOCKOUT") return "Knockout";
  if (format === "GROUP_STAGE") return "Group stage";
  return "League (round-robin)";
}
