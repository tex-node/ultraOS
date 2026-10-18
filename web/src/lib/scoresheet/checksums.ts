import type { ScoresheetColumnKey } from "./templates";
import type { ExtractedTeamTable } from "./extract";

// Checksum rules for an extracted (or hand-edited) box score (P15 I1).
//
// These are the checks `scripts/data/verify-batch.mjs` applies to a hand-transcribed batch, moved
// into code so they run immediately after OCR and again on approve - the earlier they run, the
// cheaper the error is to fix. Nothing here is a new statistical rule: each check is an identity the
// sheet's own printed totals must satisfy.
//
// A failing check does NOT block review (a sheet can legitimately be ambiguous); it blocks APPROVAL
// until a human resolves it, which is what keeps "zero silent mis-transcriptions" honest.

export type ChecksumCheck = {
  key: string;
  label: string;
  ok: boolean;
  expected: number | null;
  actual: number | null;
  detail?: string;
};

export type ChecksumReport = { ok: boolean; checks: ChecksumCheck[] };

function value(table: ExtractedTeamTable, key: ScoresheetColumnKey): number | null {
  const cell = table.totals[key] ?? null;
  if (cell && cell.value !== null) return cell.value;
  return null;
}

function sumPlayers(table: ExtractedTeamTable, key: ScoresheetColumnKey): number {
  return table.players.reduce((total, player) => total + (player.cells[key]?.value ?? 0), 0);
}

function check(key: string, label: string, expected: number | null, actual: number | null, options: { whenMissing?: "SKIP" } = {}): ChecksumCheck {
  if (expected === null && options.whenMissing === "SKIP") {
    return { key, label, ok: true, expected, actual, detail: "not printed on this sheet - check skipped" };
  }
  return { key, label, ok: expected !== null && actual !== null && expected === actual, expected, actual };
}

// Per-player identities. A team-wide sum cannot catch a single wrong cell that another cell
// compensates for; these can.
export function playerChecks(table: ExtractedTeamTable, teamLabel: string): ChecksumCheck[] {
  const checks: ChecksumCheck[] = [];
  table.players.forEach((player) => {
    const c = player.cells;
    const pts = c.points?.value ?? null;
    const twos = c.fg2m?.value ?? null;
    const threes = c.fg3m?.value ?? null;
    const fours = c.fg4m?.value ?? null;
    const fts = c.ftm?.value ?? null;
    const name = player.name || `row ${player.rowIndex + 1}`;
    if (pts !== null && [twos, threes, fts].some((v) => v !== null)) {
      const expected = 2 * (twos ?? 0) + 3 * (threes ?? 0) + 4 * (fours ?? 0) + (fts ?? 0);
      checks.push(check(`PTS_IDENTITY:${teamLabel}:${name}`, `${name}: points = 2x2PM + 3x3PM + 4x4PM + FTM`, expected, pts));
    }
    const fgm = c.fgm?.value ?? null;
    const fga = c.fga?.value ?? null;
    const fg2m = c.fg2m?.value ?? null;
    const fg2a = c.fg2a?.value ?? null;
    const fg3m = c.fg3m?.value ?? null;
    const fg3a = c.fg3a?.value ?? null;
    if (fgm !== null && (fg2m !== null || fg3m !== null)) {
      checks.push(check(`FGM_IDENTITY:${teamLabel}:${name}`, `${name}: FGM = 2PM + 3PM (+4PM)`, fgm, (fg2m ?? 0) + (fg3m ?? 0) + (fours ?? 0)));
    }
    if (fga !== null && (fg2a !== null || fg3a !== null)) {
      checks.push(check(`FGA_IDENTITY:${teamLabel}:${name}`, `${name}: FGA = 2PA + 3PA`, fga, (fg2a ?? 0) + (fg3a ?? 0)));
    }
    if (fgm !== null && fga !== null && fgm > fga) {
      checks.push({ key: `FGPM_LE_FGA:${teamLabel}:${name}`, label: `${name}: made cannot exceed attempted`, ok: false, expected: fga, actual: fgm, detail: "FGM > FGA" });
    }
    if (c.ftm && c.fta && c.ftm.value !== null && c.fta.value !== null && c.ftm.value > c.fta.value) {
      checks.push({ key: `FTM_LE_FTA:${teamLabel}:${name}`, label: `${name}: free throws made cannot exceed attempted`, ok: false, expected: c.fta.value, actual: c.ftm.value });
    }
  });
  return checks;
}

// Team-level identities: the printed Totals row against the sum of the player rows.
export function teamChecks(table: ExtractedTeamTable, teamLabel: string): ChecksumCheck[] {
  const checks: ChecksumCheck[] = [];
  const keys: { key: ScoresheetColumnKey; label: string }[] = [
    { key: "points", label: "points" },
    { key: "reb", label: "rebounds" },
    { key: "assists", label: "assists" },
    { key: "turnovers", label: "turnovers" },
    { key: "fouls", label: "fouls" },
  ];
  for (const { key, label } of keys) {
    const printed = value(table, key);
    if (printed === null) continue;
    const summed = sumPlayers(table, key);
    checks.push(check(`TEAM_SUM:${teamLabel}:${key}`, `${teamLabel}: player ${label} sum vs printed total`, printed, summed));
  }
  // Offensive + defensive rebounds must add up to the printed total, when all three exist.
  const oreb = value(table, "oreb");
  const dreb = value(table, "dreb");
  const reb = value(table, "reb");
  if (oreb !== null && dreb !== null && reb !== null) {
    checks.push(check(`REB_SPLIT:${teamLabel}`, `${teamLabel}: OR + DR = total rebounds`, reb, oreb + dreb));
  }
  return checks;
}

export type PeriodScoreLike = { label?: string; homeScore: number; awayScore: number };

// Quarter sums vs final score, using the period rows the reviewer captured.
export function periodChecks(periods: PeriodScoreLike[], homeScore: number | null, awayScore: number | null): ChecksumCheck[] {
  if (periods.length === 0) return [];
  const checks: ChecksumCheck[] = [];
  if (homeScore !== null) {
    checks.push(check("QUARTER_SUM:home", "home: period scores sum to the final score", homeScore, periods.reduce((a, p) => a + p.homeScore, 0)));
  }
  if (awayScore !== null) {
    checks.push(check("QUARTER_SUM:away", "away: period scores sum to the final score", awayScore, periods.reduce((a, p) => a + p.awayScore, 0)));
  }
  return checks;
}

export function buildChecksumReport(input: {
  teams: { table: ExtractedTeamTable; label: string }[];
  periods?: PeriodScoreLike[];
  homeScore?: number | null;
  awayScore?: number | null;
}): ChecksumReport {
  const checks: ChecksumCheck[] = [];
  for (const { table, label } of input.teams) {
    checks.push(...teamChecks(table, label));
    checks.push(...playerChecks(table, label));
  }
  checks.push(...periodChecks(input.periods ?? [], input.homeScore ?? null, input.awayScore ?? null));
  return { ok: checks.every((c) => c.ok), checks };
}
