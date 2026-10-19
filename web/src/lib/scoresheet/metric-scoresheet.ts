// A sport-agnostic scoresheet model (streak v7, Prompt 2).
//
// The basketball review path is built around `CorrectedPlayer`: eighteen fixed shooting/rebounding columns
// and a Q1–Q4 period grid. Volleyball has none of those - it has kills, aces, blocks, digs - so forcing it
// through that shape would either crash the review page (looking for "points" and "rebounds") or silently
// write zeroes.
//
// This module is the generic half: columns come from the sport definition's own PLAYER metrics, a sheet is a
// list of teams of name + metric map, and the checks are declared per column. The basketball path is left
// exactly as it was; this is additive, and the review page picks a form based on the template's sport.

import type { SportDefinition } from "@/lib/sports/types";

export type MetricColumn = { key: string; label: string; sortOrder: number };

export type MetricPlayerRow = {
  name: string;
  jersey: string | null;
  metrics: Record<string, number>;
  warnings: string[];
};

export type MetricTeam = {
  clubName: string;
  players: MetricPlayerRow[];
};

export type MetricScoresheet = {
  sportSlug: string;
  teams: MetricTeam[];
  warnings: string[];
  /** null until the reviewer picks the fixture on the approval form. */
  fixtureId?: string | null;
  approvedAt?: string;
  approvedById?: string;
};

export type MetricCheck = { id: string; label: string; ok: boolean; detail: string };

export type MetricChecksumReport = {
  ok: boolean;
  checks: MetricCheck[];
  /** Per team, per column totals - what the panel shows and what an operator compares with the sheet. */
  totals: { team: string; columns: Record<string, number> }[];
};

/** The columns a sport's scoresheet carries, straight from its definition (PLAYER-subject metrics). */
export function metricColumns(definition: SportDefinition): MetricColumn[] {
  return definition.metrics
    .filter((metric) => metric.subject === "PLAYER")
    .map((metric, index) => ({ key: metric.key, label: metric.label, sortOrder: metric.sortOrder ?? index }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function sumTeam(team: MetricTeam, key: string): number {
  return team.players.reduce((total, player) => total + (player.metrics[key] ?? 0), 0);
}

/**
 * The checks that are meaningful for a metric sheet, in order:
 *   1. the shaping checks (two teams, at least one player each, no duplicate names inside a team);
 *   2. per-team column totals (always shown - they are what a human compares with the printed sheet);
 *   3. a SPORT-SPECIFIC derivation: volleyball's `points` is defined by the sport as kills + aces + blocks
 *      + dumps, so a sheet whose PTS column disagrees with its own attack/serve/block columns is wrong.
 *      Only applied when the sheet actually carries both sides of the comparison - a missing column is
 *      "not checked", not "passed".
 */
export function metricChecksums(sheet: MetricScoresheet, definition: SportDefinition): MetricChecksumReport {
  const checks: MetricCheck[] = [];
  const columns = metricColumns(definition).map((column) => column.key);

  checks.push({
    id: "TEAMS",
    label: "Two teams",
    ok: sheet.teams.length === 2,
    detail: `${sheet.teams.length} team(s) found`,
  });
  for (const team of sheet.teams) {
    checks.push({
      id: `PLAYERS:${team.clubName}`,
      label: `${team.clubName} has players`,
      ok: team.players.length > 0,
      detail: `${team.players.length} player row(s)`,
    });
    const names = team.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    checks.push({
      id: `DUPLICATES:${team.clubName}`,
      label: `${team.clubName} has no duplicate names`,
      ok: duplicates.length === 0,
      detail: duplicates.length === 0 ? "unique" : `duplicated: ${[...new Set(duplicates)].join(", ")}`,
    });
  }

  // Sport-specific derivation. Volleyball: points = kills + aces + blocks + dumps.
  if (definition.slug === "volleyball" && columns.includes("points") && columns.includes("kills")) {
    for (const team of sheet.teams) {
      for (const player of team.players) {
        const derived = (player.metrics.kills ?? 0) + (player.metrics.aces ?? 0) + (player.metrics.blocks ?? 0) + (player.metrics.dumps ?? 0);
        const declared = player.metrics.points;
        if (declared === undefined) continue;
        checks.push({
          id: `POINTS:${team.clubName}:${player.name}`,
          label: `${player.name}: points add up`,
          ok: declared === derived,
          detail: `PTS ${declared} vs kills+aces+blocks ${derived}`,
        });
      }
    }
  }

  const totals = sheet.teams.map((team) => ({
    team: team.clubName,
    columns: Object.fromEntries(columns.map((key) => [key, sumTeam(team, key)])),
  }));

  return { ok: checks.every((check) => check.ok), checks, totals };
}

/** The definition's own event→metric rules, as a sentence for the review page's explanation line. */
export function describeDerivation(definition: SportDefinition): string | null {
  const derived = definition.metrics.find((metric) => metric.key === "points" && metric.derivedFromEventKeys?.length);
  if (!derived) return null;
  return `${derived.label} is derived from ${derived.derivedFromEventKeys!.join(", ")} - a sheet whose ${derived.label} column disagrees with those is wrong.`;
}
