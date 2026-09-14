// Multi-sport Stage 3 (S3.2/S3.3): mapping between a sport definition's metric catalog and
// concrete values. Pure functions only; no database access. These are the primitives the
// compatibility projection uses to materialize legacy PlayerStat/TeamStat rows into generic
// GameMetricValue rows (and back), so the generic model can be proven to reproduce the legacy
// reads exactly (Gate G3).

import type { SportDefinition, SportMetricDefinition, StatSubject } from "./types";

export type MetricSubjectType = "PLAYER" | "ENTRANT";

export type MetricEntry = {
  key: string;
  subject: StatSubject;
  value: number;
};

// Never-null discriminator used as GameMetricValue.subjectKey, so the uniqueness constraint holds
// despite the nullable playerId/entrantId columns.
export function metricSubjectKey(subjectType: MetricSubjectType, id: string): string {
  return `${subjectType}:${id}`;
}

export function metricDefinitionFor(
  definition: SportDefinition,
  subject: StatSubject,
  key: string,
): SportMetricDefinition | undefined {
  return definition.metrics.find((metric) => metric.subject === subject && metric.key === key);
}

// Reads numeric metric values present on a record (e.g. a legacy PlayerStat/TeamStat row) for the
// keys the definition declares for the subject. Absent, null, or non-numeric fields are skipped -
// never coerced to 0 - which preserves the legacy null-vs-zero convention.
export function metricEntriesFromRecord(
  definition: SportDefinition,
  subject: StatSubject,
  record: Record<string, unknown>,
): MetricEntry[] {
  return definition.metrics
    .filter((metric) => metric.subject === subject)
    .filter((metric) => typeof record[metric.key] === "number")
    .map((metric) => ({ key: metric.key, subject, value: record[metric.key] as number }));
}

// Rebuilds a { metricKey: value } record from entries, summing duplicates and ignoring entries the
// definition does not declare for the subject.
export function recordFromMetricEntries(
  definition: SportDefinition,
  subject: StatSubject,
  entries: MetricEntry[],
): Record<string, number> {
  const allowed = new Set(
    definition.metrics.filter((metric) => metric.subject === subject).map((metric) => metric.key),
  );
  const record: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.subject !== subject || !allowed.has(entry.key)) continue;
    record[entry.key] = (record[entry.key] ?? 0) + entry.value;
  }
  return record;
}
