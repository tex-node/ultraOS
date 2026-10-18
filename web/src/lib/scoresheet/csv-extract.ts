import type { CorrectedPlayer, CorrectedTeam, CorrectedScoresheet } from "../../server/scoresheet/imports";
import type { ScoresheetColumnKey } from "./templates";

// P15 I1 pivot: read a structured box-score CSV instead of photographing it.
//
// WHY: the OCR path measured 12/20 sheets producing a table and 0/20 review-ready on the real LBCL
// screenshots - the sheets are Instagram screenshots of a Genius Sports FIBA export, and the OCR never
// recovers the cell grid. The same provider can hand over the same numbers as CSV, which removes
// Tesseract from the problem entirely.
//
// The parser is deliberately format-tolerant rather than "one vendor's export": a section header line
// (`## TEAM NAME`) or a `team` column names the sides, the header row is matched by alias, and a
// made-attempted cell ("5-8") is split exactly like the image extractor splits it. Everything it cannot
// read becomes a warning; nothing is defaulted to zero silently.
//
// Output shape: the SAME `CorrectedScoresheet` the review queue and the ingest CLI already consume, so a
// CSV import and an OCR import differ only in how the rows were read - not in what happens next.

export type CsvMeta = {
  sourceLabel: string | null;
  scheduledAt: string | null;
  competition: string | null;
  division: string | null;
  season: string | null;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  periods: { label: string; homeScore: number; awayScore: number }[];
};

export type CsvTeam = { clubName: string; players: CorrectedPlayer[]; warnings: string[] };

export type ParsedCsvScoresheet = {
  meta: CsvMeta;
  teams: CsvTeam[];
  warnings: string[];
  /** header cell -> what it was understood as (for the review page's "how was this read" panel). */
  headerMap: { header: string; column: string }[];
};

// Header aliases for exports, which differ from the printed sheets: "2P"/"3P"/"FT" are frequently the
// made-attempted pair in ONE cell, and "%" columns are noise for us (they are recomputed).
// `combined` means: a "5-8" cell carries both the made and the attempts value.
const ALIASES: { aliases: string[]; column: ScoresheetColumnKey | "team" | null; combined?: boolean }[] = [
  { aliases: ["team", "club", "side", "squad"], column: "team" },
  { aliases: ["player", "name", "athlete", "players name"], column: "name" },
  { aliases: ["#", "no", "no.", "number", "num", "jersey", "shirt"], column: "jersey" },
  { aliases: ["min", "mins", "minutes", "mp", "time"], column: "minutes" },
  { aliases: ["pts", "points", "p", "tot pts"], column: "points" },
  { aliases: ["fg", "fgm-a", "fgm/a", "field goals"], column: "fgm", combined: true },
  { aliases: ["fgm"], column: "fgm" },
  { aliases: ["fga"], column: "fga" },
  { aliases: ["fg%", "fg %", "2p%", "3p%", "ft%", "2p %", "3p %", "ft %", "ts%", "efg%"], column: null },
  { aliases: ["2p", "2pt", "2ptm", "2pm", "2fgm", "2p m-a", "2pm-a"], column: "fg2m", combined: true },
  { aliases: ["2pm"], column: "fg2m" },
  { aliases: ["2pa", "2pta", "2fga"], column: "fg2a" },
  { aliases: ["3p", "3pt", "3ptm", "3pm", "3fgm", "3p m-a", "3pm-a"], column: "fg3m", combined: true },
  { aliases: ["3pm"], column: "fg3m" },
  { aliases: ["3pa", "3pta", "3fga"], column: "fg3a" },
  { aliases: ["ft", "ftm-a", "ftm/a", "free throws"], column: "ftm", combined: true },
  { aliases: ["ftm"], column: "ftm" },
  { aliases: ["fta"], column: "fta" },
  { aliases: ["or", "oreb", "off", "off reb", "or."], column: "oreb" },
  { aliases: ["dr", "dreb", "def", "def reb", "dr."], column: "dreb" },
  { aliases: ["reb", "tot", "tot reb", "rebounds", "trb"], column: "reb" },
  { aliases: ["ast", "assists"], column: "assists" },
  { aliases: ["to", "to.", "tov", "turnovers"], column: "turnovers" },
  { aliases: ["stl", "steals", "st"], column: "steals" },
  { aliases: ["blk", "blocks", "bs"], column: "blocks" },
  { aliases: ["pf", "fouls", "fouls committed", "fc"], column: "fouls" },
  { aliases: ["fd", "fouls drawn"], column: "foulsDrawn" },
  { aliases: ["+/-", "+-", "plus minus", "pm"], column: "plusMinus" },
  { aliases: ["eff", "efficiency", "pir", "val"], column: "efficiency" },
];

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function resolveCsvHeader(header: string): { column: ScoresheetColumnKey | "team" | null; combined: boolean } | null {
  const t = normalize(header).replace(/["']/g, "");
  if (!t) return null;
  for (const entry of ALIASES) {
    if (entry.aliases.some((alias) => normalize(alias) === t)) return { column: entry.column, combined: Boolean(entry.combined) };
  }
  // Tolerate decorations: "PTS*", "FG M/A", "MIN SP", "3PT M-A".
  const stripped = t.replace(/[*:#]/g, "").replace(/\s+/g, " ").trim();
  if (stripped !== t) return resolveCsvHeader(stripped);
  const compact = t.replace(/[\s.-]/g, "");
  for (const entry of ALIASES) {
    if (entry.aliases.some((alias) => normalize(alias).replace(/[\s.-]/g, "") === compact)) return { column: entry.column, combined: Boolean(entry.combined) };
  }
  return null;
}

// RFC4180-ish: quoted fields, escaped quotes, CRLF, and commas inside quotes.
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function toNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

// "13:51" / "13.51" / "13" -> minutes played. "DNP"/"-"/"" -> null.
function toMinutes(raw: string): { minutes: number; didNotPlay: boolean } {
  const t = raw.trim();
  if (!t) return { minutes: 0, didNotPlay: false };
  if (/^(dnp|dnd|did not play|inactive|-|—)$/i.test(t)) return { minutes: 0, didNotPlay: true };
  const clock = /^(\d{1,3}):(\d{2})$/.exec(t);
  if (clock) return { minutes: Number(clock[1]) + Number(clock[2]) / 60, didNotPlay: false };
  const value = toNumber(t);
  return { minutes: value === null ? 0 : value, didNotPlay: false };
}

function emptyPlayer(): CorrectedPlayer {
  return {
    name: "",
    jerseyNumber: null,
    didNotPlay: false,
    minutesPlayed: 0,
    points: 0,
    fgm: 0,
    fga: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    assists: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
    fouls: 0,
  };
}

const META_KEYS = ["sourceLabel", "scheduledAt", "date", "competition", "league", "division", "season", "venue", "homeScore", "awayScore", "home", "away", "gender"] as const;

export function parseBoxScoreCsv(text: string): ParsedCsvScoresheet {
  const warnings: string[] = [];
  const meta: CsvMeta & { home: string | null; away: string | null } = {
    sourceLabel: null,
    scheduledAt: null,
    competition: null,
    division: null,
    season: null,
    venue: null,
    homeScore: null,
    awayScore: null,
    periods: [],
    home: null,
    away: null,
  };
  const teams: CsvTeam[] = [];
  let currentTeam: CsvTeam | null = null;
  let headerMap: { header: string; column: string }[] | null = null;
  let columns: { column: ScoresheetColumnKey | "team"; combined: boolean }[] = [];

  const rows = parseCsvRows(text);
  for (const cells of rows) {
    const first = (cells[0] ?? "").trim();
    if (!first && cells.every((cell) => !cell.trim())) continue;
    // Metadata lines carry commas (`# period: Q1,19,2`), so the CSV field split would cut them apart:
    // reassemble the whole line for the comment branches only. A data row never starts with '#'.
    const line = first.startsWith("#") ? cells.join(",").trim() : first;

    // `# key: value` and `# key = value` carry game metadata; `## TEAM` starts a team section.
    if (line.startsWith("##")) {
      const name = line.replace(/^#+\s*/, "").trim();
      if (name) {
        currentTeam = { clubName: name, players: [], warnings: [] };
        teams.push(currentTeam);
      }
      continue;
    }
    if (line.startsWith("#")) {
      const body = line.replace(/^#+\s*/, "");
      const separator = body.includes(":") ? ":" : body.includes("=") ? "=" : null;
      if (!separator) {
        // A bare comment line is a note, not metadata.
        continue;
      }
      const key = normalize(body.slice(0, body.indexOf(separator)));
      const value = body.slice(body.indexOf(separator) + 1).trim();
      if (key === "period" || key.startsWith("period ")) {
        const parts = value.split(/[,;|]/).map((part) => part.trim());
        const label = parts[0] || `Q${meta.periods.length + 1}`;
        const homeScore = toNumber(parts[1] ?? "");
        const awayScore = toNumber(parts[2] ?? "");
        if (homeScore === null || awayScore === null) warnings.push(`Period line "${value}" is missing a score.`);
        else meta.periods.push({ label, homeScore, awayScore });
        continue;
      }
      if (key === "homescore") meta.homeScore = toNumber(value);
      else if (key === "awayscore") meta.awayScore = toNumber(value);
      else if (key === "home") meta.home = value;
      else if (key === "away") meta.away = value;
      else if (key === "date" || key === "scheduledat") meta.scheduledAt = value;
      else if (key === "competition" || key === "league") meta.competition = value;
      else if (key === "sourcelabel" || key === "title" || key === "name") meta.sourceLabel = value;
      else if (key === "division") meta.division = value;
      else if (key === "season") meta.season = value;
      else if (key === "venue") meta.venue = value;
      else if (!META_KEYS.includes(key as (typeof META_KEYS)[number])) warnings.push(`Ignored unknown metadata line "# ${body}".`);
      continue;
    }

    // The first non-comment row is the header.
    if (!headerMap) {
      headerMap = [];
      columns = [];
      let teamColumn = -1;
      cells.forEach((cell, index) => {
        const resolved = resolveCsvHeader(cell);
        if (!resolved) {
          if (cell.trim()) warnings.push(`Column "${cell.trim()}" was not recognised and its values are ignored.`);
          headerMap!.push({ header: cell.trim(), column: "ignored" });
          columns.push({ column: "team", combined: false });
          return;
        }
        if (resolved.column === "team") teamColumn = index;
        headerMap!.push({ header: cell.trim(), column: resolved.column ?? "ignored" });
        columns.push({ column: resolved.column ?? ("team" as const), combined: resolved.combined });
        if (resolved.column === null) warnings.push(`Column "${cell.trim()}" is a percentage column - ignored (recomputed).`);
      });
      const names = headerMap.filter((entry) => entry.column === "name").length;
      if (names === 0) throw new Error("The CSV has no player-name column (expected PLAYER / NAME).");
      if (teamColumn === -1 && !first) warnings.push("No team column and no '## TEAM' section headers: every row is treated as one team.");
      continue;
    }

    // A repeated header row (the second team's section repeats the header) must not become a player
    // called "Player": if every cell is a recognised header alias, this row IS a header, not data.
    if (cells.length > 1 && cells.every((cell) => !cell.trim() || resolveCsvHeader(cell) !== null)) continue;

    // Data row.
    const row: Partial<Record<ScoresheetColumnKey | "team", string>> = {};
    cells.forEach((cell, index) => {
      const column = columns[index];
      if (!column || column.column === "team") return;
      // A "combined" alias may carry the attempts in the same cell ("5-8"); handled below.
      const existing = row[column.column];
      if (existing === undefined) row[column.column] = cell;
      void column.combined;
    });
    const teamName = (cells[columns.findIndex((entry) => entry.column === "team")] ?? "").trim();
    if (columns.some((entry) => entry.column === "team") && teamName) {
      let team = teams.find((candidate) => normalize(candidate.clubName) === normalize(teamName));
      if (!team) {
        team = { clubName: teamName, players: [], warnings: [] };
        teams.push(team);
      }
      currentTeam = team;
    }

    const name = (row.name ?? "").trim();
    if (!name || /^totals?$/i.test(name)) {
      // A totals row is informational: the checksums compare against the players, not against it.
      continue;
    }
    if (!currentTeam) {
      currentTeam = { clubName: meta.home ?? "Home", players: [], warnings: [] };
      teams.push(currentTeam);
    }

    const player = emptyPlayer();
    player.name = name;
    player.jerseyNumber = toNumber(row.jersey ?? "");
    if (row.minutes !== undefined) {
      const minutes = toMinutes(row.minutes);
      player.didNotPlay = minutes.didNotPlay;
      player.minutesPlayed = Math.round(minutes.minutes);
    }
    const assign = (key: ScoresheetColumnKey) => {
      const raw = row[key];
      if (raw === undefined) return;
      const value = toNumber(raw);
      if (value === null) {
        if (raw.trim() !== "") currentTeam!.warnings.push(`${name}: "${raw}" is not a number for ${key} - left at 0.`);
        return;
      }
      (player as unknown as Record<string, number>)[key] = value;
    };
    for (const key of ["points", "fga", "fg2a", "fg3a", "fta", "oreb", "dreb", "reb", "assists", "turnovers", "steals", "blocks", "fouls", "fg4m"] as ScoresheetColumnKey[]) {
      assign(key);
    }

    // Made values, including the made-attempted pair form.
    const splitPair = (raw: string | undefined): { made: number | null; attempts: number | null } => {
      if (raw === undefined) return { made: null, attempts: null };
      const t = raw.trim();
      if (!t) return { made: null, attempts: null };
      const pair = /^(\d{1,3})\s*[-/]\s*(\d{1,3})$/.exec(t);
      if (pair) return { made: Number(pair[1]), attempts: Number(pair[2]) };
      const single = toNumber(t);
      return { made: single, attempts: null };
    };
    const applyPair = (madeKey: ScoresheetColumnKey, attemptsKey: ScoresheetColumnKey) => {
      const { made, attempts } = splitPair(row[madeKey]);
      if (made !== null) (player as unknown as Record<string, number>)[madeKey] = made;
      if (attempts !== null) (player as unknown as Record<string, number>)[attemptsKey] = attempts;
    };
    applyPair("fgm", "fga");
    applyPair("fg2m", "fg2a");
    applyPair("fg3m", "fg3a");
    applyPair("ftm", "fta");

    // Derived where the export omitted them: attempts only when the total column is absent AND the
    // components are present; the same rule the image extractor uses (never invent a value that the
    // source did not carry).
    if (row.fga === undefined && (row.fg2a !== undefined || row.fg3a !== undefined)) player.fga = player.fg2a + player.fg3a;
    if (row.reb === undefined && (row.oreb !== undefined || row.dreb !== undefined)) player.reb = player.oreb + player.dreb;
    if (row.fgm === undefined && (row.fg2m !== undefined || row.fg3m !== undefined)) player.fgm = player.fg2m + player.fg3m;

    currentTeam.players.push(player);
  }

  if (!headerMap) throw new Error("The CSV has no header row.");
  if (teams.length === 0) throw new Error("The CSV has a header but no player rows.");

  // Order: meta.home first when named, else the order of appearance.
  if (meta.home) {
    const index = teams.findIndex((team) => normalize(team.clubName) === normalize(meta.home!));
    if (index > 0) teams.unshift(teams.splice(index, 1)[0]);
    else if (index === -1) warnings.push(`The home team "${meta.home}" named in the metadata has no rows in the CSV.`);
  }

  const parsed: ParsedCsvScoresheet = { meta, teams, warnings, headerMap: headerMap ?? [] };
  for (const team of teams) {
    if (team.players.length === 0) warnings.push(`Team "${team.clubName}" has no player rows.`);
    if (team.players.length > 20) warnings.push(`Team "${team.clubName}" has ${team.players.length} rows - more than a real rotation; check the file.`);
  }
  if (teams.length > 2) warnings.push(`${teams.length} teams found; an ingest expects exactly two (home and away).`);
  return parsed;
}

/** The team totals the reviewer will see pre-filled, computed from the rows (the CSV has no totals row). */
export function teamTotals(team: CsvTeam): CorrectedTeam["totals"] {
  const sum = (key: keyof CorrectedPlayer) => team.players.reduce((total, player) => total + (typeof player[key] === "number" ? (player[key] as number) : 0), 0);
  return { points: sum("points"), rebounds: sum("reb"), assists: sum("assists"), turnovers: sum("turnovers"), fouls: sum("fouls") };
}

/** CSV parse -> the same corrected shape the review queue edits and the ingest CLI consumes. */
export function csvToCorrected(parsed: ParsedCsvScoresheet, options?: { sourceLabel?: string }): Omit<CorrectedScoresheet, "approvedAt" | "approvedById"> {
  const [home, away] = parsed.teams;
  if (!home || !away) throw new Error(`A scoresheet needs two teams; this file has ${parsed.teams.length}.`);
  const sumPoints = (team: CsvTeam) => team.players.reduce((total, player) => total + player.points, 0);
  return {
    version: "csv-1",
    sourceLabel: options?.sourceLabel ?? parsed.meta.sourceLabel ?? `${home.clubName} vs ${away.clubName}`,
    scheduledAt: parsed.meta.scheduledAt ?? "",
    homeScore: parsed.meta.homeScore ?? sumPoints(home),
    awayScore: parsed.meta.awayScore ?? sumPoints(away),
    periods: parsed.meta.periods,
    home: { clubName: home.clubName, players: home.players, totals: teamTotals(home) },
    away: { clubName: away.clubName, players: away.players, totals: teamTotals(away) },
  };
}
