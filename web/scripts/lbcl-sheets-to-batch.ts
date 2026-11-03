import { readFileSync, writeFileSync } from "node:fs";

// Expand the compact sheet transcription into the batch shape the importer and validator already understand.
//
// The compact form stores one row per player as
//   [jersey, name, minutes, 2PM, 2PA, 3PM, 3PA, FTM, FTA, OR, DR, AS, TO, ST, BL, PF, FD, +/-, EF]
// and nothing that can be derived: FGM/FGA and points are computed, because on a FIBA sheet they ARE the sum of the
// components, and a transcription that disagrees with its own arithmetic is a misread, not a data point.
//
//   npx tsx scripts/lbcl-sheets-to-batch.ts scripts/data/lbcl-2026-sheets-gw7.json /tmp/lbcl-gw7-batch.json
type Sheet = {
  game: number;
  label: string;
  scheduledAt: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  periods: [number, number][];
  printed: { home: PrintedTotals; away: PrintedTotals };
  // The sheet prints a "Team/Coach" row for rebounds and turnovers that belong to nobody; the printed totals include it.
  teamRow?: { home: Partial<PrintedTotals>; away: Partial<PrintedTotals> };
  homeRows: number[][];
  awayRows: number[][];
};
type PrintedTotals = { fg: [number, number]; p2: [number, number]; p3: [number, number]; ft: [number, number]; reb: number; ast: number; to: number; pf: number };
type Compact = { games: Sheet[] };

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: lbcl-sheets-to-batch.ts <sheets.json> <batch.json>");
  process.exit(2);
}
const sheets = JSON.parse(readFileSync(input, "utf8")) as Compact;

const CLUB_NAMES: Record<string, string> = {
  UTA: "Ultra Basketball", CTB: "Cantonment Braves", CPS: "Campos Basketballers", LBS: "LXB Surulere",
  LFK: "Leo Kareem Foundation", OGR: "Ogra Hoop Kings", WHF: "White Fire", LAR: "Lagos Raptors",
  SSH: "Seaside Hoopers", STM: "Square Team",
};

function expand(rows: number[][], printed: PrintedTotals, clubShort: string, score: number, side: string, teamRow: Partial<PrintedTotals> = {}) {
  const players = rows.map((row) => {
    const [jersey, name, minutes, p2m, p2a, p3m, p3a, ftm, fta, or_, dr, as_, to, st, bl, pf, fd, plusMinus, ef] = row as number[] & { 1: string };
    return {
      fullName: name as unknown as string,
      // The importer reads reportedName when it exists; a sheet transcript has no separate reported spelling.
      reportedName: name as unknown as string,
      jerseyNumber: jersey,
      didNotPlay: false,
      minutesPlayed: minutes,
      points: p2m * 2 + p3m * 3 + ftm,
      fieldGoalsMade: p2m + p3m,
      fieldGoalsAttempted: p2a + p3a,
      twoPointsMade: p2m, twoPointsAttempted: p2a,
      threePointsMade: p3m, threePointsAttempted: p3a,
      freeThrowsMade: ftm, freeThrowsAttempted: fta,
      offensiveRebounds: or_, defensiveRebounds: dr,
      assists: as_, turnovers: to, steals: st, blocks: bl,
      foulsCommitted: pf, foulsDrawn: fd,
      plusMinus: plusMinus, efficiency: ef,
    };
  }).map(({ ...p }) => p);

  const sum = (pick: (p: typeof players[number]) => number) => players.reduce((total, p) => total + pick(p), 0);
  const computed = {
    points: sum((p) => p.points),
    fg: [sum((p) => p.fieldGoalsMade), sum((p) => p.fieldGoalsAttempted)],
    p2: [sum((p) => p.twoPointsMade), sum((p) => p.twoPointsAttempted)],
    p3: [sum((p) => p.threePointsMade), sum((p) => p.threePointsAttempted)],
    ft: [sum((p) => p.freeThrowsMade), sum((p) => p.freeThrowsAttempted)],
    reb: sum((p) => p.offensiveRebounds + p.defensiveRebounds),
    ast: sum((p) => p.assists),
    to: sum((p) => p.turnovers),
    pf: sum((p) => p.foulsCommitted),
  };
  const aggregates = {
    rebounds: teamRow.reb ?? 0,
    assists: teamRow.ast ?? 0,
    turnovers: teamRow.to ?? 0,
    fouls: teamRow.pf ?? 0,
  };
  const mismatches: string[] = [];
  if (computed.points !== score) mismatches.push(`points ${computed.points} != printed ${score}`);
  for (const key of ["fg", "p2", "p3", "ft"] as const) {
    const [made, attempted] = computed[key];
    const [pmade, pattempted] = printed[key];
    if (made !== pmade || attempted !== pattempted) mismatches.push(`${key} ${made}/${attempted} != printed ${pmade}/${pattempted}`);
  }
  for (const key of ["reb", "ast", "to", "pf"] as const) {
    const withTeamRow = computed[key] + aggregates[key === "reb" ? "rebounds" : key === "ast" ? "assists" : key === "to" ? "turnovers" : "fouls"];
    if (withTeamRow !== printed[key]) mismatches.push(`${key} ${withTeamRow} != printed ${printed[key]}`);
  }
  if (mismatches.length) console.log(`  ${side} ${clubShort}: ${mismatches.join(" · ")}`);

  return {
    clubName: CLUB_NAMES[clubShort] ?? clubShort,
    clubShortName: clubShort,
    players,
    totals: { points: score, rebounds: printed.reb, assists: printed.ast, turnovers: printed.to, fouls: printed.pf },
    teamAggregates: aggregates,
    advanced: {
      pointsFromTurnovers: 0, pointsInPaint: 0, pointsInPaintMade: 0, pointsInPaintAttempted: 0,
      secondChancePoints: 0, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
      biggestLead: 0, biggestScoringRun: 0, pointsPerPossession: 0, leadChanges: 0, timesTied: 0,
      timeWithLeadSeconds: 0,
    },
    mismatches,
  };
}

const games = sheets.games.map((sheet) => {
  console.log(`game ${sheet.game}: ${sheet.label}`);
  const home = expand(sheet.homeRows, sheet.printed.home, sheet.home, sheet.homeScore, "home", sheet.teamRow?.home ?? {});
  const away = expand(sheet.awayRows, sheet.printed.away, sheet.away, sheet.awayScore, "away", sheet.teamRow?.away ?? {});
  const periodSum = sheet.periods.reduce((acc, [h, a]) => [acc[0] + h, acc[1] + a], [0, 0]);
  if (periodSum[0] !== sheet.homeScore || periodSum[1] !== sheet.awayScore) {
    console.log(`  periods ${periodSum.join("-")} != final ${sheet.homeScore}-${sheet.awayScore}`);
  }
  return {
    tournament: { name: "Lagos Basketball Community League", slug: "lbcl", sportSlug: "basketball", vanitySlug: "lbcl" },
    division: { name: "Open Division", slug: "open" },
    season: { name: "2026 Season", startDate: "2026-09-18T00:00:00.000Z", endDate: "2026-11-29T00:00:00.000Z" },
    playerGender: "MALE",
    sourceLabel: `LBCL Game ${sheet.game} - ${home.clubName} vs ${away.clubName} - ${sheet.label} (box score transcribed from the FIBA sheet)`,
    venue: { name: "Venue TBC (unspecified in source sheet)", address: "Lagos, Nigeria", city: "Lagos", capacity: 300 },
    scheduledAt: sheet.scheduledAt,
    homeScore: sheet.homeScore,
    awayScore: sheet.awayScore,
    periods: sheet.periods.map(([h, a], index) => ({ period: index + 1, label: `Q${index + 1}`, homeScore: h, awayScore: a })),
    home: { clubName: home.clubName, clubShortName: home.clubShortName, players: home.players, totals: home.totals, teamAggregates: home.teamAggregates, advanced: home.advanced },
    away: { clubName: away.clubName, clubShortName: away.clubShortName, players: away.players, totals: away.totals, teamAggregates: away.teamAggregates, advanced: away.advanced },
  };
});

writeFileSync(output, JSON.stringify({ organization: { mode: "existing", organizationId: "__ORG__" }, actorId: "__ACTOR__", games }, null, 2));
console.log(`\nwrote ${output} with ${games.length} game(s)`);
