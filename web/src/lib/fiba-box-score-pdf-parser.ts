// Parses the text layer of a FIBA/Genius Sports "FIBA Box Score" PDF (the exact export format
// used for every real Season Zero game) into a CanonicalBoxScoreImport candidate.
//
// This module does NOT shell out to a PDF library itself - callers extract the PDF's text
// first (e.g. `pdftotext <file> -`, without `-layout`) and pass the raw string in. Keeping the
// parser pure text-in/struct-out makes it trivially testable without a PDF fixture file.
//
// IMPORTANT, empirically-verified limitation (checked directly against real Season Zero PDFs
// while building this): this export format renders a genuinely-zero/blank cell as *no text at
// all*, which silently shifts every later token in that row by one position once the PDF's
// text layer is flattened to a stream. For at least one real game (APEX vs VORTEX), this
// causes the Field Goals line to carry one fewer M/A pair than there are non-DNP players, and
// the per-player counting-stats block (rebounds/AS/TO/ST/BS/fouls/+-/EF/PTS) to have rows of
// inconsistent, sometimes glued-together length ("1 1 2 1 0000014 2" instead of 12 distinct
// numbers). Positionally zipping those tokens to players would silently produce wrong stats.
//
// So: header/score/period data (always cleanly delimited, verified reliable) is parsed with
// confidence. The player roster (name/jersey/minutes/starter/captain - a clean space-separated
// list) is parsed with confidence. Shooting splits (FG/2PT/3PT/FT, "M/A %" tokens) are parsed
// *only* when the token count for a block exactly matches the non-DNP player count for that
// team - otherwise the whole block is flagged unreliable rather than guessed. The counting-stat
// block is never positionally parsed at all - it's carried as raw text for manual
// transcription via the same hand-transcription + arithmetic-validator workflow already proven
// for all 11 real Season Zero games (see scripts/g84-import-season-zero-results.ts).

export type ShootingSplit = { made: number; attempted: number; percent: number };

export type FibaBoxScoreHeader = {
  homeLabel: string;
  awayLabel: string;
  homeScore: number;
  awayScore: number;
  venueLine: string;
  gameNumberLabel: string | null;
};

export type FibaBoxScorePeriodScores = {
  // Column labels as printed (e.g. "Q1", "Q2") mapped to [homeValue, awayValue] pairs. Kept
  // as raw label->pair rather than assuming exactly two periods, since the same template is
  // reused for overtime games.
  periods: Array<{ label: string; homeScore: number; awayScore: number }>;
};

export type FibaBoxScorePlayerRosterEntry = {
  jerseyNumber: number;
  isStarter: boolean;
  reportedName: string;
  isCaptain: boolean;
  didNotPlay: boolean;
};

export type FibaBoxScoreTeamCandidate = {
  teamLabel: string;
  roster: FibaBoxScorePlayerRosterEntry[];
  minutesByIndex: (string | null)[];
  // Present only when the shooting-split token count for this block matched the roster size
  // exactly (see module doc). null means "do not trust this - transcribe manually".
  fieldGoalsByIndex: (ShootingSplit | null)[] | null;
  twoPointsByIndex: (ShootingSplit | null)[] | null;
  threePointsByIndex: (ShootingSplit | null)[] | null;
  freeThrowsByIndex: (ShootingSplit | null)[] | null;
};

export type FibaBoxScoreParseResult = {
  header: FibaBoxScoreHeader | null;
  periods: FibaBoxScorePeriodScores | null;
  home: FibaBoxScoreTeamCandidate | null;
  away: FibaBoxScoreTeamCandidate | null;
  warnings: string[];
};

function parseHeader(text: string, warnings: string[]): FibaBoxScoreHeader | null {
  const venueMatch = text.match(/^(.+?)\n/);
  const scoreMatch = text.match(/^(.+?)\s+(\d+)\s+\S{1,2}\s+(\d+)\s+(.+?)\s*$/m);
  const gameNumberMatch = text.match(/Game No\.:\s*(\S+)/);
  if (!scoreMatch) {
    warnings.push("Could not locate the '<HOME> <score> - <score> <AWAY>' header line.");
    return null;
  }
  return {
    homeLabel: scoreMatch[1].trim(),
    awayLabel: scoreMatch[4].trim(),
    homeScore: Number(scoreMatch[2]),
    awayScore: Number(scoreMatch[3]),
    venueLine: venueMatch ? venueMatch[1].trim() : "",
    gameNumberLabel: gameNumberMatch ? gameNumberMatch[1] : null,
  };
}

function parsePeriods(text: string, homeLabel: string, awayLabel: string, warnings: string[]): FibaBoxScorePeriodScores | null {
  const homeLine = text.match(new RegExp(`^${escapeRegExp(homeLabel)}\\s+(.+)$`, "m"));
  const awayLine = text.match(new RegExp(`^${escapeRegExp(awayLabel)}\\s+(.+)$`, "m"));
  const periodLabels = [...text.matchAll(/^Q(\d+)\s/gm)].map((m) => `Q${m[1]}`);
  if (!homeLine || !awayLine || periodLabels.length === 0) {
    warnings.push("Could not locate the period-by-period scoring block - period scores will need manual entry.");
    return null;
  }
  const homeValues = homeLine[1].trim().split(/\s+/).map(Number);
  const awayValues = awayLine[1].trim().split(/\s+/).map(Number);
  if (homeValues.length !== periodLabels.length || awayValues.length !== periodLabels.length) {
    warnings.push(`Period score token count (${homeValues.length}/${awayValues.length}) didn't match detected period labels (${periodLabels.length}) - period scores will need manual entry.`);
    return null;
  }
  return {
    periods: periodLabels.map((label, i) => ({ label, homeScore: homeValues[i], awayScore: awayValues[i] })),
  };
}

// Matches a jersey/name token stream like: "*0 IBRAHIMDAMUSA *3 BAMIDELE TAIWO 15 EGBAYELO
// PETER (C) *17 NWODU ELIJAH *20 IFOGHALE JUSTIN Team/Coach Totals". Names are ALL-CAPS with
// no digits, so a run of non-digit words up to the next jersey-number token is one player.
function parseRoster(rosterLine: string): FibaBoxScorePlayerRosterEntry[] {
  const withoutTotals = rosterLine.replace(/\s*Team\/Coach\s+Totals\s*$/i, "");
  const tokens = withoutTotals.trim().split(/\s+(?=\*?\d+\s)/).filter(Boolean);
  const roster: FibaBoxScorePlayerRosterEntry[] = [];
  for (const token of tokens) {
    const match = token.match(/^(\*)?(\d+)\s+(.+?)(\s*\(C\))?$/);
    if (!match) continue;
    roster.push({
      isStarter: Boolean(match[1]),
      jerseyNumber: Number(match[2]),
      reportedName: match[3].trim(),
      isCaptain: Boolean(match[4]),
      didNotPlay: false,
    });
  }
  return roster;
}

function parseMinutes(minutesLine: string, rosterSize: number, warnings: string[], teamLabel: string): (string | null)[] {
  const tokens = minutesLine.trim().split(/\s+/);
  if (tokens.length !== rosterSize) {
    warnings.push(`${teamLabel}: minutes token count (${tokens.length}) didn't match roster size (${rosterSize}) - minutes will need manual entry.`);
    return new Array(rosterSize).fill(null);
  }
  return tokens.map((t) => (t === "DNP" ? "DNP" : t));
}

// Only trusts a shooting block when its M/A-pair count exactly equals rosterSize - see module
// doc for why a blank/zero cell can silently shift positions in this PDF format.
function parseShootingBlock(blockText: string, rosterSize: number): ShootingSplit[] | null {
  const pairs = [...blockText.matchAll(/(\d+)\/(\d+)\s+([\d.]+)/g)].map((m) => ({
    made: Number(m[1]),
    attempted: Number(m[2]),
    percent: Number(m[3]),
  }));
  if (pairs.length === rosterSize) return pairs;

  if (pairs.length === rosterSize + 1) {
    // A team-total row (Made/Attempted = sum of every player's) commonly ends up captured
    // inside the same block, with no reliable blank-line/layout cue distinguishing it from a
    // player row in this template. Only drop it when the arithmetic actually confirms it's a
    // sum - the same pre-flight validation discipline used for hand transcription in
    // scripts/g84-import-season-zero-results.ts - never on a positional guess alone.
    const playerPairs = pairs.slice(0, rosterSize);
    const trailing = pairs[rosterSize];
    const madeSum = playerPairs.reduce((sum, p) => sum + p.made, 0);
    const attemptedSum = playerPairs.reduce((sum, p) => sum + p.attempted, 0);
    if (trailing.made === madeSum && trailing.attempted === attemptedSum) return playerPairs;
  }

  return null;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTeamBlock(text: string, teamLabel: string, warnings: string[]): FibaBoxScoreTeamCandidate | null {
  // The team section runs from "<LABEL> (<SHORT>)" up to the next team header or end of text.
  const startPattern = new RegExp(`^${escapeRegExp(teamLabel)}\\s*\\(.+?\\)\\s*$`, "m");
  const startMatch = startPattern.exec(text);
  if (!startMatch) {
    warnings.push(`Could not locate the "${teamLabel} (...)" section header.`);
    return null;
  }
  const rest = text.slice(startMatch.index + startMatch[0].length);
  const nextTeamHeader = rest.search(/^[A-Z][A-Z0-9 ]*\s*\(.+?\)\s*$/m);
  const section = nextTeamHeader === -1 ? rest : rest.slice(0, nextTeamHeader);

  const rosterLineMatch = section.match(/^(?:\*?\d+\s+.+)$/m);
  if (!rosterLineMatch) {
    warnings.push(`${teamLabel}: could not locate the jersey/name roster line.`);
    return null;
  }
  const roster = parseRoster(rosterLineMatch[0]);
  if (roster.length === 0) {
    warnings.push(`${teamLabel}: roster line matched but no players were parsed from it.`);
    return null;
  }

  const minutesLineMatch = section.match(/^((?:\d{1,2}:\d{2}|DNP)(?:\s+(?:\d{1,2}:\d{2}|DNP))*)\s*$/m);
  const minutesByIndex = minutesLineMatch
    ? parseMinutes(minutesLineMatch[1], roster.length, warnings, teamLabel)
    : new Array(roster.length).fill(null);
  roster.forEach((p, i) => {
    p.didNotPlay = minutesByIndex[i] === "DNP";
  });
  const nonDnpCount = roster.filter((p) => !p.didNotPlay).length;

  const fgBlockMatch = section.match(/Field Goals[\s\S]*?(?=2 Points|$)/);
  const twoBlockMatch = section.match(/2 Points[\s\S]*?3 Points[\s\S]*?(?=Free Throws|$)/);
  const ftBlockMatch = section.match(/Free Throws[\s\S]*?(?=Coach:|Rebounds|$)/);

  return {
    teamLabel,
    roster,
    minutesByIndex,
    fieldGoalsByIndex: fgBlockMatch ? parseShootingBlock(fgBlockMatch[0], nonDnpCount) : null,
    twoPointsByIndex: twoBlockMatch ? parseShootingBlock(twoBlockMatch[0], nonDnpCount) : null,
    threePointsByIndex: null, // 2PT and 3PT tokens are interleaved in one combined block in
    // this template and cannot be safely split without the same positional-shift risk - both
    // require manual transcription unless a future revision of this parser can reliably
    // separate the two token streams.
    freeThrowsByIndex: ftBlockMatch ? parseShootingBlock(ftBlockMatch[0], nonDnpCount) : null,
  };
}

export function parseFibaBoxScoreText(rawText: string): FibaBoxScoreParseResult {
  const warnings: string[] = [];
  const header = parseHeader(rawText, warnings);
  const periods = header ? parsePeriods(rawText, header.homeLabel, header.awayLabel, warnings) : null;
  const home = header ? parseTeamBlock(rawText, header.homeLabel, warnings) : null;
  const away = header ? parseTeamBlock(rawText, header.awayLabel, warnings) : null;

  if (home?.fieldGoalsByIndex === null) warnings.push(`${header?.homeLabel}: Field Goals block token count didn't match roster - needs manual transcription.`);
  if (away?.fieldGoalsByIndex === null) warnings.push(`${header?.awayLabel}: Field Goals block token count didn't match roster - needs manual transcription.`);
  warnings.push("2PT/3PT and all counting stats (rebounds, AS, TO, ST, BS, fouls, +/-, EF, PTS) are never auto-parsed by this module - transcribe them manually and validate with the same arithmetic checks used in scripts/g84-import-season-zero-results.ts before importing.");

  return { header, periods, home, away, warnings };
}
