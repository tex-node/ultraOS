// Volleyball scoresheet parsing (streak v6, Prompt 4).
//
// The basketball parser (csv-extract.ts) is deliberately untouched: it maps a fixed set of shooting
// columns into `CorrectedPlayer`, and bending it to carry kills/blocks/digs would make both formats worse.
// This module reuses its row reader and its `## TEAM` section convention, but produces what volleyball
// actually has - per-player metric counts keyed by the sport definition's own metric keys.
//
// The keys are the definition's (`kills`, `errors`, `aces`, `blocks`, `digs`, `assists`, `serves`,
// `points`, `blockAssists`, `serveReceives`), so the output can be written as GameMetricValue rows against
// the SportMetricDefinition catalog without a translation table in between.

import { parseCsvRows } from "./csv-extract";

export type VolleyballPlayerRow = {
  name: string;
  jersey: string | null;
  /** Definition metric key -> count. Only keys the sheet actually carried. */
  metrics: Record<string, number>;
  warnings: string[];
};

export type VolleyballTeamRow = {
  clubName: string;
  players: VolleyballPlayerRow[];
  warnings: string[];
};

export type ParsedVolleyballScoresheet = {
  teams: VolleyballTeamRow[];
  warnings: string[];
  headerMap: { header: string; metric: string | null }[];
};

// Header aliases, including the abbreviations printed on the official scoresheet (K, E, SA, BLK, DIG, AST,
// SR) and the longer export names. A percentage column is noise: it is recomputed from the counts.
const METRIC_ALIASES: { aliases: string[]; metric: string | null }[] = [
  { aliases: ["k", "kill", "kills", "att kill", "kills*"], metric: "kills" },
  { aliases: ["e", "err", "error", "errors", "attack error", "attack errors", "att err"], metric: "errors" },
  { aliases: ["ace", "aces", "sa", "service ace", "service aces"], metric: "aces" },
  { aliases: ["blk", "block", "blocks", "bs", "stuff"], metric: "blocks" },
  { aliases: ["ba", "block assist", "block assists"], metric: "blockAssists" },
  { aliases: ["dig", "digs", "d"], metric: "digs" },
  { aliases: ["ast", "assist", "assists", "set", "sets"], metric: "assists" },
  { aliases: ["serve", "serves", "sv", "se"], metric: "serves" },
  { aliases: ["sr", "serve receive", "serve receives", "rec"], metric: "serveReceives" },
  { aliases: ["pts", "point", "points", "total points"], metric: "points" },
  { aliases: ["#", "no", "no.", "number", "num", "jersey", "shirt"], metric: null },
  { aliases: ["player", "name", "athlete", "players name"], metric: null },
  { aliases: ["team", "club", "side", "squad"], metric: null },
  { aliases: ["pct", "%", "k%", "h%", "e%"], metric: null },
];

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function resolveVolleyballHeader(header: string): { metric: string | null; known: boolean } {
  const text = normalize(header).replace(/["']/g, "");
  if (!text) return { metric: null, known: false };
  for (const entry of METRIC_ALIASES) {
    if (entry.aliases.some((alias) => normalize(alias) === text)) return { metric: entry.metric, known: true };
  }
  const stripped = text.replace(/[*:#]/g, "").replace(/\s+/g, " ").trim();
  if (stripped !== text) return resolveVolleyballHeader(stripped);
  return { metric: null, known: false };
}

function isNumeric(value: string): boolean {
  // Strict on purpose: stripping every non-digit would turn "K" and "#" into 0 and make a header row look
  // like data (which is exactly how the first version of this parser failed).
  const cleaned = value.trim().replace(/[%s*]+$/i, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned));
}

/**
 * Parse a volleyball box score. Supported shape (the one the pilot fixture uses):
 *
 *   ## Surge
 *   #,Player,K,E,SA,BLK,DIG,AST,PTS
 *   4,Ada Nwosu,12,3,2,1,7,0,15
 *   ...
 *   ## Vortex
 *   ...
 *
 * Rows before the first `## TEAM` are ignored with a warning, because a player with no team cannot be
 * attributed and silently guessing a side is worse than saying so.
 */
export function parseVolleyballCsv(text: string): ParsedVolleyballScoresheet {
  const rows = parseCsvRows(text);
  const teams: VolleyballTeamRow[] = [];
  const warnings: string[] = [];
  const headerMap: { header: string; metric: string | null }[] = [];

  let current: VolleyballTeamRow | null = null;
  let columns: { index: number; metric: string | null; header: string; name: boolean; jersey: boolean }[] = [];

  for (const row of rows) {
    const cells = row.map((cell) => cell.trim());
    const first = cells[0] ?? "";

    if (first.startsWith("##")) {
      const clubName = first.replace(/^##\s*/, "").trim();
      if (!clubName) {
        warnings.push("a '##' section header had no team name and was ignored");
        continue;
      }
      current = { clubName, players: [], warnings: [] };
      teams.push(current);
      columns = [];
      continue;
    }

    // Header row: at least two recognised labels and no numeric cells.
    const resolved = cells.map((cell) => resolveVolleyballHeader(cell));
    const recognised = resolved.filter((entry) => entry.known).length;
    const looksLikeHeader = recognised >= 2 && !cells.some((cell) => isNumeric(cell) && cell !== "");
    if (looksLikeHeader && columns.length === 0) {
      columns = cells.map((cell, index) => {
        const header = cell;
        const known = resolved[index];
        headerMap.push({ header, metric: known.metric });
        return {
          index,
          metric: known.metric,
          header,
          name: ["player", "name", "athlete", "players name"].includes(normalize(header)),
          jersey: ["#", "no", "no.", "number", "num", "jersey", "shirt"].includes(normalize(header)),
        };
      });
      if (!columns.some((column) => column.name)) {
        warnings.push(`header row in "${current?.clubName ?? "?"}" has no player/name column`);
      }
      if (!columns.some((column) => column.metric)) {
        warnings.push(`header row in "${current?.clubName ?? "?"}" has no recognised volleyball metric column`);
      }
      continue;
    }

    if (cells.every((cell) => cell === "")) continue;
    if (!current) {
      warnings.push(`ignored a data row before any '## TEAM' section: ${first}`);
      continue;
    }
    if (columns.length === 0) {
      warnings.push(`ignored a data row in "${current.clubName}" before its header row`);
      continue;
    }

    const playerWarnings: string[] = [];
    let name = "";
    let jersey: string | null = null;
    const metrics: Record<string, number> = {};
    for (const column of columns) {
      const value = cells[column.index] ?? "";
      if (column.name) {
        name = value;
        continue;
      }
      if (column.jersey) {
        jersey = value || null;
        continue;
      }
      if (!column.metric) continue;
      if (!isNumeric(value)) {
        if (value) playerWarnings.push(`"${column.header}" had a non-numeric value "${value}" for ${name || "a player"}`);
        continue;
      }
      metrics[column.metric] = (metrics[column.metric] ?? 0) + Number(value.trim().replace(/[%s*]+$/i, ""));
    }
    if (!name) {
      current.warnings.push(`a data row had no player name and was skipped: ${cells.join(",")}`);
      continue;
    }
    current.players.push({ name, jersey, metrics, warnings: playerWarnings });
  }

  if (teams.length === 0) warnings.push("no '## TEAM' section found - this does not look like a team volleyball sheet");
  for (const team of teams) {
    if (team.players.length === 0) team.warnings.push("no player rows under this team");
  }
  return { teams, warnings, headerMap };
}
