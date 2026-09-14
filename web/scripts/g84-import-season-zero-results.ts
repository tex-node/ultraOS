// One-time import of real Season Zero results from FIBA/Genius Sports box score PDFs
// (11 of 12 competitive fixtures; Ember vs Nova has no report and is left SCHEDULED).
// Source: C:\Users\XPS\OneDrive\Documents\Projects\NEON Games\Season Zero\Game Stats\
// Every number below was transcribed directly from the PDF, cross-checked against the
// PDF's own Totals row and against the app's real roster (matched by normalized name).

import { prisma } from "../src/lib/prisma";
import { importGameResult, type GameResultImportInput, type ImportPlayerLine } from "../src/lib/game-result-import";
import { recalculateStandings } from "../src/lib/standings-recalculate";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

function mmss(min: number, sec: number) {
  return Math.round(min + sec / 60);
}

function row(
  reportedName: string,
  jerseyNumber: number,
  min: [number, number],
  fg: [number, number],
  two: [number, number],
  three: [number, number],
  ft: [number, number],
  or_: number,
  dr: number,
  as_: number,
  to: number,
  st: number,
  bs: number,
  pf: number,
  fd: number,
  plusMinus: number,
  efficiency: number,
  points: number,
): ImportPlayerLine {
  return {
    reportedName,
    jerseyNumber,
    didNotPlay: false,
    minutesPlayed: mmss(min[0], min[1]),
    points,
    fieldGoalsMade: fg[0],
    fieldGoalsAttempted: fg[1],
    twoPointsMade: two[0],
    twoPointsAttempted: two[1],
    threePointsMade: three[0],
    threePointsAttempted: three[1],
    freeThrowsMade: ft[0],
    freeThrowsAttempted: ft[1],
    offensiveRebounds: or_,
    defensiveRebounds: dr,
    assists: as_,
    turnovers: to,
    steals: st,
    blocks: bs,
    foulsCommitted: pf,
    foulsDrawn: fd,
    plusMinus,
    efficiency,
  };
}

function dnp(reportedName: string, jerseyNumber: number): ImportPlayerLine {
  return {
    reportedName,
    jerseyNumber,
    didNotPlay: true,
    minutesPlayed: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    twoPointsMade: 0,
    twoPointsAttempted: 0,
    threePointsMade: 0,
    threePointsAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    assists: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
    foulsCommitted: 0,
    foulsDrawn: 0,
    plusMinus: 0,
    efficiency: 0,
  };
}

const GAMES: Array<GameResultImportInput & { fixtureLabel: string }> = [
  // Game 1: Eclipse 15 - 14 Ember
  {
    fixtureLabel: "Eclipse vs Ember",
    fixtureId: "cmsp9a72000004pkk8hx0mlzs",
    homeShortName: "ECLIPSE",
    awayShortName: "EMBER",
    homeScore: 15,
    awayScore: 14,
    sourceLabel: "FIBA Box Score ELE vs EBR 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 9, awayScore: 12 },
      { period: 2, label: "Q2", homeScore: 15, awayScore: 14 },
    ],
    home: {
      seasonClubShortName: "ECLIPSE",
      totals: { points: 15, rebounds: 10, assists: 2, turnovers: 3, fouls: 7 },
      advanced: {
        pointsFromTurnovers: 6, pointsInPaint: 12, pointsInPaintMade: 6, pointsInPaintAttempted: 11,
        secondChancePoints: 4, fastBreakPoints: 2, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 3, biggestScoringRun: 6, pointsPerPossession: 0.72, leadChanges: 5, timesTied: 2, timeWithLeadSeconds: 4 * 60 + 25,
      },
      players: [
        row("ADAGIFT", 0, [5, 52], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0),
        row("UDOYIBOGOODLUCK", 3, [11, 9], [0, 1], [0, 0], [0, 1], [0, 0], 1, 0, 1, 0, 1, 0, 0, 0, 2, 2, 0),
        row("MARYVERONICA", 8, [14, 0], [1, 4], [1, 4], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 2, 0, -1, -1, 2),
        dnp("OKECHUKWUGIFT", 9),
        row("JOHNSONPRECIOUS", 15, [2, 59], [0, 2], [0, 2], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, 0),
        row("NGUDIUBAAMARACHUKWU", 17, [7, 20], [0, 0], [0, 0], [0, 0], [0, 0], 0, 2, 0, 1, 0, 0, 0, 0, 2, 1, 0),
        row("OKORONMESOMA", 20, [20, 0], [3, 4], [3, 3], [0, 1], [0, 0], 1, 1, 0, 1, 0, 0, 1, 0, 1, 6, 6),
        row("EMMANUELBOLUWATIFE", 33, [20, 0], [1, 2], [1, 1], [0, 1], [1, 5], 2, 0, 0, 1, 0, 0, 3, 3, 1, -1, 3),
        row("AGOMUOFAITH", 45, [18, 40], [1, 3], [1, 3], [0, 0], [2, 8], 0, 2, 0, 0, 2, 0, 1, 4, 1, 0, 4),
      ],
    },
    away: {
      seasonClubShortName: "EMBER",
      totals: { points: 14, rebounds: 15, assists: 0, turnovers: 5, fouls: 8 },
      advanced: {
        pointsFromTurnovers: 0, pointsInPaint: 6, pointsInPaintMade: 3, pointsInPaintAttempted: 6,
        secondChancePoints: 4, fastBreakPoints: 5, fastBreakPointsFromTurnovers: 0, benchPoints: 1,
        biggestLead: 3, biggestScoringRun: 5, pointsPerPossession: 0.85, leadChanges: 5, timesTied: 2, timeWithLeadSeconds: 8 * 60 + 12,
      },
      players: [
        row("ONITOLOKOYINSOLA", 0, [10, 39], [0, 1], [0, 0], [0, 1], [0, 0], 0, 1, 0, 0, 0, 0, 0, 2, -4, 0, 0),
        row("AKINGBADEELIZABETH", 3, [17, 51], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0),
        row("PRECIOUSADEBAYO", 8, [12, 20], [1, 3], [0, 1], [1, 2], [2, 6], 1, 2, 0, 2, 1, 0, 0, 3, 1, 1, 5),
        row("ROLIOMATSEYE", 15, [9, 40], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        row("IWAJOBAROFIAT", 17, [7, 11], [2, 2], [2, 2], [0, 0], [0, 0], 0, 1, 0, 2, 0, 0, 4, 0, 1, 3, 4),
        row("GODWINNNEOMA", 20, [4, 28], [0, 1], [0, 1], [0, 0], [0, 0], 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        row("OSHUNNUBIIYANUOLUWA", 33, [17, 51], [0, 0], [0, 0], [0, 0], [1, 2], 0, 1, 0, 0, 0, 0, 2, 1, -1, 1, 1),
        row("IGWEBUIKEOLUCHUKWU", 45, [20, 0], [2, 5], [2, 4], [0, 1], [0, 0], 2, 1, 0, 0, 0, 0, 1, 0, -1, 4, 4),
      ],
    },
  },
  // Game 2: Apex 23 - 19 Flux
  {
    fixtureLabel: "Apex vs Flux",
    fixtureId: "cmsp9a72y00024pkkblu1v755",
    homeShortName: "APEX",
    awayShortName: "FLUX",
    homeScore: 23,
    awayScore: 19,
    sourceLabel: "FIBA Box Score APX vs FLX 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 7, awayScore: 6 },
      { period: 2, label: "Q2", homeScore: 23, awayScore: 19 },
    ],
    home: {
      seasonClubShortName: "APEX",
      totals: { points: 23, rebounds: 14, assists: 1, turnovers: 5, fouls: 7 },
      advanced: {
        pointsFromTurnovers: 5, pointsInPaint: 8, pointsInPaintMade: 4, pointsInPaintAttempted: 8,
        secondChancePoints: 4, fastBreakPoints: 5, fastBreakPointsFromTurnovers: 3, benchPoints: 0,
        biggestLead: 10, biggestScoringRun: 6, pointsPerPossession: 1.04, leadChanges: 6, timesTied: 1, timeWithLeadSeconds: 12 * 60 + 30,
      },
      players: [
        row("IBRAHIMDAMUSA", 0, [20, 0], [2, 4], [2, 2], [0, 2], [3, 3], 0, 0, 0, 1, 1, 0, 1, 4, 4, 5, 7),
        row("BAMIDELETAIWO", 3, [12, 2], [1, 3], [1, 3], [0, 0], [0, 0], 2, 0, 0, 1, 0, 1, 2, 0, 5, 2, 2),
        row("FRIDAYJACKSIFON", 8, [15, 54], [0, 0], [0, 0], [0, 0], [0, 0], 0, 2, 0, 1, 0, 0, 1, 0, -2, 1, 0),
        dnp("EGBAYELOPETER", 15),
        row("NWODOELIJAH", 17, [20, 0], [2, 5], [2, 4], [0, 1], [0, 0], 2, 3, 0, 0, 0, 0, 1, 0, 4, 6, 4),
        row("IFOGHALEJUSTINE", 20, [20, 0], [3, 8], [1, 4], [2, 4], [2, 2], 0, 2, 0, 0, 0, 0, 0, 1, 4, 7, 10),
        dnp("OLUWATOBIADESANYA", 33),
        row("OHAMARAMIRACLE", 45, [12, 4], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 2, 1, 0, 2, 0, 5, -1, 0),
      ],
    },
    away: {
      seasonClubShortName: "FLUX",
      totals: { points: 19, rebounds: 15, assists: 0, turnovers: 6, fouls: 7 },
      advanced: {
        pointsFromTurnovers: 4, pointsInPaint: 6, pointsInPaintMade: 3, pointsInPaintAttempted: 11,
        secondChancePoints: 3, fastBreakPoints: 2, fastBreakPointsFromTurnovers: 2, benchPoints: 4,
        biggestLead: 4, biggestScoringRun: 6, pointsPerPossession: 0.77, leadChanges: 6, timesTied: 1, timeWithLeadSeconds: 6 * 60 + 12,
      },
      players: [
        row("NWOKESAVIOUR", 0, [3, 0], [0, 3], [0, 3], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -4, -3, 0),
        row("OPEMIPOSIOLUWAGBAMI", 3, [17, 0], [3, 6], [0, 1], [3, 5], [0, 0], 0, 1, 0, 2, 0, 0, 0, 1, 0, 5, 9),
        row("MUNACHIOKAFOR", 8, [17, 0], [1, 7], [1, 6], [0, 1], [0, 0], 0, 0, 0, 1, 0, 0, 0, 2, 0, -5, 2),
        row("ELEMCHIEBUKA", 15, [20, 0], [1, 3], [1, 3], [0, 0], [2, 4], 5, 3, 0, 2, 1, 0, 1, 2, -4, 7, 4),
        row("ONYEKAOGBOLU", 17, [20, 0], [0, 1], [0, 1], [0, 0], [0, 0], 1, 2, 0, 0, 1, 1, 1, 0, -4, 4, 0),
        row("OLAWUNIEMMANUEL", 20, [10, 42], [0, 1], [0, 0], [0, 1], [0, 0], 0, 0, 0, 0, 0, 0, 2, 0, -5, -1, 0),
        row("OJAJUNIOLUWATOBI", 33, [9, 18], [1, 1], [1, 1], [0, 0], [2, 4], 1, 0, 0, 0, 0, 0, 0, 2, 3, 3, 4),
        row("OREMIPOSIKINDE", 45, [3, 0], [0, 1], [0, 0], [0, 1], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -4, -1, 0),
      ],
    },
  },
  // Game 3: Eclipse 21 - 7 Halo
  {
    fixtureLabel: "Eclipse vs Halo",
    fixtureId: "cmsp9a73700044pkkc7hlibcl",
    homeShortName: "ECLIPSE",
    awayShortName: "HALO",
    homeScore: 21,
    awayScore: 7,
    sourceLabel: "FIBA Box Score ECL vs HALO 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 12, awayScore: 4 },
      { period: 2, label: "Q2", homeScore: 21, awayScore: 7 },
    ],
    home: {
      seasonClubShortName: "ECLIPSE",
      totals: { points: 21, rebounds: 8, assists: 5, turnovers: 1, fouls: 7 },
      advanced: {
        pointsFromTurnovers: 15, pointsInPaint: 16, pointsInPaintMade: 8, pointsInPaintAttempted: 11,
        secondChancePoints: 3, fastBreakPoints: 4, fastBreakPointsFromTurnovers: 2, benchPoints: 0,
        biggestLead: 17, biggestScoringRun: 9, pointsPerPossession: 1.37, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 19 * 60 + 53,
      },
      players: [
        row("OBIEFUNUSUSAN", 0, [20, 0], [0, 0], [0, 0], [0, 0], [0, 0], 1, 1, 1, 0, 0, 0, 3, 0, 14, 3, 0),
        row("UDOYIBOGOODLUCK", 3, [9, 35], [0, 0], [0, 0], [0, 0], [0, 0], 0, 1, 1, 1, 0, 0, 0, 0, 2, 1, 0),
        row("MARYVERONICA", 8, [13, 59], [1, 2], [1, 2], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 0, 0, 15, 2, 2),
        dnp("OKECHUKWUGIFT", 9),
        dnp("JOHNSONPRECIOUS", 15),
        row("NGUDUIBAAMARACHUKWU", 17, [6, 1], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -1, -1, 0),
        row("OKORONMESOMA", 20, [20, 0], [2, 4], [2, 4], [0, 0], [1, 2], 0, 2, 0, 0, 0, 0, 2, 2, 14, 4, 5),
        row("EMMANUELBOLUWATIFE", 33, [20, 0], [6, 8], [5, 6], [1, 2], [1, 1], 1, 2, 0, 0, 1, 0, 1, 1, 14, 16, 14),
        row("AGOMUOFAITH", 45, [10, 25], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 3, 0, 1, 0, 0, 1, 12, 4, 0),
      ],
    },
    away: {
      seasonClubShortName: "HALO",
      totals: { points: 7, rebounds: 10, assists: 0, turnovers: 8, fouls: 4 },
      advanced: {
        pointsFromTurnovers: 0, pointsInPaint: 2, pointsInPaintMade: 1, pointsInPaintAttempted: 8,
        secondChancePoints: 5, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 0, biggestScoringRun: 3, pointsPerPossession: 0.41, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 0,
      },
      players: [
        dnp("GRACEOLUTOSOYE", 0),
        dnp("GINIKAEZEOGU", 3),
        row("ADESHINAFUNMILAYO", 8, [2, 18], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 0, 0, -3, -1, 0),
        row("ERICDIVINE", 15, [20, 0], [0, 4], [0, 3], [0, 1], [0, 0], 0, 0, 0, 1, 0, 0, 0, 0, -14, -5, 0),
        row("ABIGAILEFFIONG", 17, [20, 0], [0, 2], [0, 1], [0, 1], [2, 6], 1, 0, 0, 2, 0, 0, 2, 3, -14, -5, 2),
        row("FAVOURFRANKLIN", 20, [20, 0], [0, 2], [0, 2], [0, 0], [0, 0], 1, 1, 0, 2, 0, 0, 0, 0, -14, -2, 0),
        row("EMMANUELAMARACHI", 33, [20, 0], [1, 2], [1, 2], [0, 0], [3, 3], 4, 2, 0, 1, 0, 0, 1, 4, -14, 9, 5),
        row("YINKADAUDU", 45, [17, 42], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 1, 0, -11, -2, 0),
      ],
    },
  },
  // Game 4: Apex 8 - 13 Surge
  {
    fixtureLabel: "Apex vs Surge",
    fixtureId: "cmsp9a73g00064pkkfilc2sve",
    homeShortName: "APEX",
    awayShortName: "SURGE",
    homeScore: 8,
    awayScore: 13,
    sourceLabel: "FIBA Box Score APX vs SUR 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 4, awayScore: 9 },
      { period: 2, label: "Q2", homeScore: 8, awayScore: 13 },
    ],
    home: {
      seasonClubShortName: "APEX",
      totals: { points: 8, rebounds: 11, assists: 2, turnovers: 4, fouls: 4 },
      advanced: {
        pointsFromTurnovers: 3, pointsInPaint: 4, pointsInPaintMade: 2, pointsInPaintAttempted: 4,
        secondChancePoints: 5, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 0, biggestScoringRun: 4, pointsPerPossession: 0.65, leadChanges: 1, timesTied: 1, timeWithLeadSeconds: 0,
      },
      players: [
        row("IBRAHIMDAMUSA", 0, [20, 0], [1, 3], [1, 1], [0, 2], [0, 0], 1, 1, 1, 0, 0, 0, 1, 0, -5, 2, 2),
        row("BAMIDELETAIWO", 3, [15, 30], [0, 0], [0, 0], [0, 0], [2, 4], 1, 0, 0, 0, 0, 0, 1, 2, 0, 1, 2),
        row("FRIDAYJACKSIFON", 8, [14, 37], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 1, 0, -1, -1, 0),
        row("EGBAYELOPETER", 15, [9, 14], [0, 0], [0, 0], [0, 0], [0, 0], 1, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0),
        row("NWODOELIJAH", 17, [20, 0], [1, 3], [1, 3], [0, 0], [2, 4], 3, 2, 0, 2, 1, 0, 1, 2, -5, 4, 4),
        row("IFOGHALEJUSTINE", 20, [10, 46], [0, 4], [0, 3], [0, 1], [0, 2], 1, 0, 1, 0, 0, 0, 0, 1, -5, -4, 0),
        dnp("OLUWATOBIADESANYA", 33),
        row("OHAMARAMIRACLE", 45, [9, 53], [0, 0], [0, 0], [0, 0], [0, 2], 0, 0, 0, 0, 0, 0, 0, 1, -9, -2, 0),
      ],
    },
    away: {
      seasonClubShortName: "SURGE",
      totals: { points: 13, rebounds: 6, assists: 1, turnovers: 2, fouls: 8 },
      advanced: {
        pointsFromTurnovers: 5, pointsInPaint: 6, pointsInPaintMade: 3, pointsInPaintAttempted: 7,
        secondChancePoints: 4, fastBreakPoints: 3, fastBreakPointsFromTurnovers: 3, benchPoints: 3,
        biggestLead: 5, biggestScoringRun: 5, pointsPerPossession: 1.08, leadChanges: 1, timesTied: 1, timeWithLeadSeconds: 17 * 60 + 28,
      },
      players: [
        row("BENJAMINCHIBUZOR", 0, [20, 0], [1, 5], [1, 3], [0, 2], [2, 2], 0, 0, 0, 0, 0, 0, 0, 2, 5, 0, 4),
        row("ADAMOLADIPUPO", 3, [16, 53], [0, 0], [0, 0], [0, 0], [0, 0], 0, 1, 1, 0, 1, 0, 0, 0, 9, 3, 0),
        row("OLUBODUNDANIEL", 8, [9, 14], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
        row("KEHINDEBAMIDELE", 15, [20, 0], [1, 2], [1, 2], [0, 0], [0, 0], 1, 2, 0, 0, 0, 0, 2, 0, 5, 4, 2),
        row("TOBISTEPHEN", 17, [20, 0], [0, 1], [0, 1], [0, 0], [4, 4], 1, 1, 0, 1, 0, 0, 4, 1, 5, 4, 4),
        row("AGBOJOSHUA", 20, [4, 10], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0),
        row("SANNIGEORGE", 33, [3, 7], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -4, 0, 0),
        row("SHITTULANRE", 45, [6, 36], [1, 1], [1, 1], [0, 0], [1, 1], 0, 0, 1, 0, 0, 0, 0, 1, 4, 2, 3),
      ],
    },
  },
  // Game 5: Eclipse 19 - 29 Nova
  {
    fixtureLabel: "Eclipse vs Nova",
    fixtureId: "cmsp9a73p00084pkkmdiw8ic1",
    homeShortName: "ECLIPSE",
    awayShortName: "NOVA",
    homeScore: 19,
    awayScore: 29,
    sourceLabel: "FIBA Box Score ECL vs NOVA 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 11, awayScore: 15 },
      { period: 2, label: "Q2", homeScore: 19, awayScore: 29 },
    ],
    home: {
      seasonClubShortName: "ECLIPSE",
      totals: { points: 19, rebounds: 11, assists: 4, turnovers: 5, fouls: 10 },
      advanced: {
        pointsFromTurnovers: 0, pointsInPaint: 12, pointsInPaintMade: 6, pointsInPaintAttempted: 11,
        secondChancePoints: 0, fastBreakPoints: 2, fastBreakPointsFromTurnovers: 0, benchPoints: 2,
        biggestLead: 0, biggestScoringRun: 4, pointsPerPossession: 0.77, leadChanges: 1, timesTied: 2, timeWithLeadSeconds: 0,
      },
      players: [
        row("OBIEFUNASUSAN", 0, [13, 0], [0, 2], [0, 2], [0, 0], [0, 0], 1, 2, 1, 1, 0, 0, 3, 0, -3, 1, 0),
        row("UDOYIBOGOODLUCK", 3, [9, 9], [0, 1], [0, 0], [0, 1], [0, 0], 1, 0, 0, 1, 0, 0, 0, 0, -7, -1, 0),
        row("MARYVERONICA", 8, [15, 18], [0, 2], [0, 1], [0, 1], [0, 2], 0, 0, 0, 0, 0, 0, 1, 2, -11, -4, 0),
        dnp("OKECHUKWUGIFT", 9),
        row("JOHNSONPRECIOUS", 15, [0, 54], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -2, 0, 0),
        row("NGUDIUBAAMARACHUKWU", 17, [9, 33], [1, 1], [1, 1], [0, 0], [0, 0], 0, 0, 1, 0, 0, 0, 0, 0, -6, 3, 2),
        row("OKORONMESOMACHUKWU", 20, [20, 0], [0, 2], [0, 2], [0, 0], [0, 0], 0, 1, 1, 0, 1, 0, 1, 0, -10, -2, 0),
        row("EMMANUELBOLUWATIFE", 33, [19, 6], [7, 9], [6, 7], [1, 2], [2, 4], 0, 4, 4, 1, 1, 1, 2, 3, -8, 19, 17),
        row("AGONMOFAITH", 45, [13, 0], [0, 1], [0, 0], [0, 1], [0, 2], 0, 1, 1, 1, 0, 0, 2, 1, -3, -2, 0),
      ],
    },
    away: {
      seasonClubShortName: "NOVA",
      totals: { points: 29, rebounds: 21, assists: 5, turnovers: 4, fouls: 6 },
      advanced: {
        pointsFromTurnovers: 4, pointsInPaint: 16, pointsInPaintMade: 8, pointsInPaintAttempted: 16,
        secondChancePoints: 9, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 6,
        biggestLead: 10, biggestScoringRun: 6, pointsPerPossession: 1.21, leadChanges: 1, timesTied: 2, timeWithLeadSeconds: 16 * 60 + 48,
      },
      players: [
        row("OFFIONGSHARON", 0, [16, 54], [3, 7], [3, 6], [0, 1], [3, 4], 2, 2, 0, 0, 0, 0, 2, 2, 10, 8, 9),
        row("BAKAREOREOLUWA", 3, [3, 6], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0),
        row("OKECHUKWUSYLVIA", 8, [8, 53], [2, 3], [2, 3], [0, 0], [2, 2], 1, 0, 1, 1, 0, 0, 2, 1, 3, 6, 6),
        row("OYEKANAISHAT", 15, [15, 49], [1, 5], [1, 4], [0, 1], [2, 5], 1, 1, 2, 1, 1, 0, 1, 4, 10, 1, 4),
        row("TIKFAGBILA", 17, [17, 25], [2, 6], [2, 4], [0, 2], [2, 4], 1, 2, 2, 2, 0, 0, 0, 2, 8, 3, 6),
        row("OKAFORCHIDINMA", 20, [3, 6], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 0, 0, 2, 1, 0),
        row("KEMEPADEPRECIOUS", 33, [20, 0], [2, 3], [2, 3], [0, 0], [0, 1], 3, 4, 0, 0, 1, 1, 0, 1, 10, 11, 4),
        row("RACHELJOHN", 45, [14, 47], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, 11, 0, 0),
      ],
    },
  },
  // Game 6: Apex 14 - 19 Vortex
  {
    fixtureLabel: "Apex vs Vortex",
    fixtureId: "cmsp9a741000a4pkk4b1ckf84",
    homeShortName: "APEX",
    awayShortName: "VORTEX",
    homeScore: 14,
    awayScore: 19,
    sourceLabel: "FIBA Box Score APEX vs VTX 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 2, awayScore: 6 },
      { period: 2, label: "Q2", homeScore: 14, awayScore: 19 },
    ],
    home: {
      seasonClubShortName: "APEX",
      totals: { points: 14, rebounds: 21, assists: 1, turnovers: 5, fouls: 5 },
      advanced: {
        pointsFromTurnovers: 0, pointsInPaint: 10, pointsInPaintMade: 5, pointsInPaintAttempted: 14,
        secondChancePoints: 4, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 8,
        biggestLead: 0, biggestScoringRun: 5, pointsPerPossession: 0.65, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 0,
      },
      players: [
        row("IBRAHIMDAMUSA", 0, [20, 0], [1, 6], [0, 3], [1, 3], [0, 0], 0, 1, 1, 0, 2, 1, 0, 0, -5, -2, 3),
        row("BAMIDELETAIWO", 3, [14, 8], [1, 2], [1, 2], [0, 0], [1, 2], 2, 2, 0, 0, 0, 0, 0, 1, -3, 5, 3),
        row("FRIDAYJACKSIFON", 8, [7, 39], [0, 4], [0, 2], [0, 2], [0, 0], 2, 0, 0, 0, 0, 0, 0, 0, -6, -2, 0),
        row("EGBAYELOPETER", 15, [12, 21], [1, 2], [1, 2], [0, 0], [0, 0], 1, 1, 1, 0, 0, 0, 0, 0, 1, 4, 2),
        row("NWODUELIJAH", 17, [20, 0], [0, 2], [0, 1], [0, 1], [0, 0], 2, 0, 0, 1, 0, 0, 0, 0, -5, -1, 0),
        row("IFOGHALEJUSTIN", 20, [15, 15], [0, 3], [0, 2], [0, 1], [0, 2], 1, 0, 0, 1, 0, 0, 4, 1, -5, -5, 0),
        dnp("OLUWATOBIADESANYA", 33),
        row("OHAMRARAMIRACLE", 45, [10, 37], [3, 5], [3, 5], [0, 0], [0, 2], 2, 3, 0, 1, 0, 1, 1, 1, -2, 7, 6),
      ],
    },
    away: {
      seasonClubShortName: "VORTEX",
      totals: { points: 19, rebounds: 12, assists: 3, turnovers: 2, fouls: 3 },
      advanced: {
        pointsFromTurnovers: 5, pointsInPaint: 10, pointsInPaintMade: 5, pointsInPaintAttempted: 9,
        secondChancePoints: 0, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 9, biggestScoringRun: 7, pointsPerPossession: 0.90, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 19 * 60 + 13,
      },
      players: [
        row("AFOLABIPECULIAR", 0, [2, 2], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0),
        row("IFEOLUWAOBASA", 3, [10, 36], [0, 0], [0, 0], [0, 0], [1, 1], 0, 0, 0, 0, 0, 0, 1, 0, 3, 1, 1),
        row("DENNISGODSWILL", 8, [20, 0], [4, 5], [4, 4], [0, 1], [0, 1], 0, 5, 2, 2, 0, 0, 1, 1, 5, 11, 8),
        row("RALUCHUKWUBRIAN", 15, [13, 18], [0, 1], [0, 1], [0, 0], [0, 0], 0, 1, 0, 0, 0, 0, 0, 0, -1, 0, 0),
        row("JOSEPHADESHINA", 17, [5, 53], [0, 1], [0, 1], [0, 0], [0, 0], 1, 1, 0, 0, 0, 0, 0, 1, 4, 1, 0),
        row("NOUMANEJIRINADA", 20, [13, 48], [2, 2], [2, 2], [0, 0], [0, 1], 0, 2, 0, 0, 2, 0, 0, 1, 6, 7, 4),
        row("FAVOUREJELONU", 33, [20, 0], [2, 7], [1, 2], [1, 5], [1, 2], 0, 1, 0, 0, 0, 0, 0, 1, 5, 2, 6),
        row("VICTOREDET", 45, [14, 23], [0, 2], [0, 1], [0, 1], [0, 0], 0, 0, 1, 0, 0, 0, 1, 0, 1, -1, 0),
      ],
    },
  },
  // Game 7: Ember (home) 5 - 20 Halo (away)
  {
    fixtureLabel: "Ember vs Halo",
    fixtureId: "cmsp9a74b000c4pkk6odrffxt",
    homeShortName: "EMBER",
    awayShortName: "HALO",
    homeScore: 5,
    awayScore: 20,
    sourceLabel: "FIBA Box Score HAL vs EMB 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 0, awayScore: 13 },
      { period: 2, label: "Q2", homeScore: 5, awayScore: 20 },
    ],
    home: {
      seasonClubShortName: "EMBER",
      totals: { points: 5, rebounds: 8, assists: 1, turnovers: 5, fouls: 3 },
      advanced: {
        pointsFromTurnovers: 2, pointsInPaint: 4, pointsInPaintMade: 2, pointsInPaintAttempted: 6,
        secondChancePoints: 0, fastBreakPoints: 2, fastBreakPointsFromTurnovers: 2, benchPoints: 0,
        biggestLead: 0, biggestScoringRun: 3, pointsPerPossession: 0.32, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 0,
      },
      players: [
        row("ONITOLOKOYINSOLA", 0, [9, 28], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 0, 0, -1, 1, 0),
        row("AKINGBADEELIZABETH", 3, [7, 27], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 0, 0, -9, -1, 0),
        row("PRECIOUSADEBAYO", 8, [10, 32], [0, 2], [0, 0], [0, 2], [0, 0], 0, 2, 0, 1, 0, 0, 1, 0, -14, -1, 0),
        row("ROLIOMATSEYE", 15, [12, 33], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 1, 1, 0, 0, 0, -6, 0, 0),
        row("IWAJOBAROFIAT", 17, [14, 32], [1, 3], [1, 2], [0, 1], [1, 2], 0, 0, 1, 1, 2, 0, 0, 2, -10, 2, 3),
        row("GODWINNNEOMA", 20, [11, 20], [0, 1], [0, 1], [0, 0], [0, 0], 1, 1, 0, 0, 0, 0, 0, 1, -14, 1, 0),
        row("OSUNNUBIIYANUOLUWA", 33, [14, 8], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -6, -1, 0),
        row("IGWEBUIKEOLUCHUKWU", 45, [20, 0], [1, 4], [1, 3], [0, 1], [0, 2], 1, 0, 0, 1, 0, 0, 1, 2, -15, -3, 2),
      ],
    },
    away: {
      seasonClubShortName: "HALO",
      totals: { points: 20, rebounds: 10, assists: 3, turnovers: 7, fouls: 5 },
      advanced: {
        pointsFromTurnovers: 3, pointsInPaint: 18, pointsInPaintMade: 9, pointsInPaintAttempted: 13,
        secondChancePoints: 2, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 15, biggestScoringRun: 13, pointsPerPossession: 0.84, leadChanges: 1, timesTied: 0, timeWithLeadSeconds: 18 * 60 + 42,
      },
      players: [
        dnp("GRACEOLUTOSOYE", 0),
        row("GINIKAEZEOGU", 3, [3, 56], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 0, 0, 2, -1, 0),
        row("ADESHINAFUNMILAYO", 8, [1, 59], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0),
        row("ERICDIVINE", 15, [14, 54], [0, 2], [0, 2], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 1, 0, 13, -1, 0),
        row("ABIGAILEFFONG", 17, [20, 0], [3, 6], [3, 6], [0, 0], [1, 2], 0, 0, 2, 2, 1, 0, 1, 1, 15, 4, 7),
        row("FAVOURFRANKLIN", 20, [18, 1], [1, 3], [1, 3], [0, 0], [1, 2], 1, 3, 0, 2, 0, 0, 1, 2, 16, 2, 3),
        row("EMMANUELAMARACHI", 33, [20, 0], [4, 4], [4, 4], [0, 0], [0, 0], 0, 3, 1, 1, 0, 0, 0, 0, 15, 11, 8),
        row("YINKADAUDU", 45, [12, 33], [1, 2], [1, 2], [0, 0], [0, 0], 0, 2, 0, 1, 0, 0, 1, 0, 11, 2, 2),
      ],
    },
  },
  // Game 8: Flux 21 - 10 Surge
  {
    fixtureLabel: "Flux vs Surge",
    fixtureId: "cmsp9a74j000e4pkka6v3qmsx",
    homeShortName: "FLUX",
    awayShortName: "SURGE",
    homeScore: 21,
    awayScore: 10,
    sourceLabel: "FIBA Box Score FLUX vs SURGE 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 2, awayScore: 8 },
      { period: 2, label: "Q2", homeScore: 21, awayScore: 10 },
    ],
    home: {
      seasonClubShortName: "FLUX",
      totals: { points: 21, rebounds: 15, assists: 1, turnovers: 3, fouls: 5 },
      advanced: {
        pointsFromTurnovers: 0, pointsInPaint: 10, pointsInPaintMade: 5, pointsInPaintAttempted: 10,
        secondChancePoints: 2, fastBreakPoints: 3, fastBreakPointsFromTurnovers: 0, benchPoints: 7,
        biggestLead: 11, biggestScoringRun: 10, pointsPerPossession: 1.18, leadChanges: 2, timesTied: 1, timeWithLeadSeconds: 7 * 60,
      },
      players: [
        row("NWOKESAVIOUR", 0, [20, 0], [1, 3], [0, 2], [1, 1], [3, 3], 0, 3, 0, 1, 0, 1, 0, 1, 11, 7, 6),
        row("OPEMIPOSIOLUWAGBAMI", 3, [8, 57], [1, 2], [0, 0], [1, 2], [0, 0], 0, 0, 1, 0, 0, 0, 1, 1, 14, 3, 3),
        row("MUNACHIOKAFOR", 8, [8, 57], [1, 2], [1, 2], [0, 0], [2, 4], 1, 0, 0, 1, 1, 0, 1, 1, 14, 2, 4),
        row("ELEMCHIEBUKA", 15, [13, 29], [0, 2], [0, 2], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 1, 1, -2, 0),
        row("ONYEKAOGBOLU", 17, [20, 0], [1, 1], [1, 1], [0, 0], [0, 0], 2, 2, 0, 0, 0, 0, 2, 0, 11, 6, 2),
        row("OLAWUNIEMMANUEL", 20, [11, 3], [0, 2], [0, 1], [0, 1], [0, 0], 0, 0, 0, 1, 1, 0, 0, 0, -3, -2, 0),
        row("OJAJUNIOLUWATOBI", 33, [17, 34], [3, 4], [3, 4], [0, 0], [0, 0], 1, 3, 0, 0, 0, 0, 0, 0, 7, 9, 6),
        dnp("OSUNOREMIPOSI", 45),
      ],
    },
    away: {
      seasonClubShortName: "SURGE",
      totals: { points: 10, rebounds: 11, assists: 0, turnovers: 2, fouls: 5 },
      advanced: {
        pointsFromTurnovers: 2, pointsInPaint: 8, pointsInPaintMade: 4, pointsInPaintAttempted: 12,
        secondChancePoints: 2, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 6,
        biggestLead: 6, biggestScoringRun: 4, pointsPerPossession: 0.63, leadChanges: 2, timesTied: 1, timeWithLeadSeconds: 8 * 60 + 5,
      },
      players: [
        row("BENJAMINCHIBUZOR", 0, [20, 0], [0, 7], [0, 1], [0, 6], [2, 2], 0, 0, 0, 1, 1, 1, 0, 0, -11, -4, 2),
        row("ADAMOLADIPUPO", 3, [9, 40], [3, 7], [3, 6], [0, 1], [0, 0], 0, 1, 1, 0, 0, 0, 0, 1, -1, 3, 6),
        dnp("OLUBODUNDANIEL", 8),
        row("KEHINDEBAMIDELE", 15, [19, 40], [1, 1], [1, 1], [0, 0], [0, 0], 1, 1, 2, 0, 0, 0, 1, 1, -11, 5, 2),
        row("TOBISTEPHEN", 17, [17, 34], [0, 1], [0, 1], [0, 0], [0, 0], 1, 0, 1, 0, 0, 1, 3, 0, -7, 1, 0),
        row("AGBOJOSHUA", 20, [17, 34], [0, 2], [0, 1], [0, 1], [0, 0], 2, 0, 0, 1, 0, 0, 0, 3, -7, -1, 0),
        row("SANNIGEORGE", 33, [13, 6], [0, 0], [0, 0], [0, 0], [0, 0], 1, 0, 0, 0, 0, 0, 0, 0, -12, 1, 0),
        row("SHITTULANRE", 45, [2, 26], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, -4, 0, 0),
      ],
    },
  },
  // Game 10: Flux 37 - 45 Vortex (Overtime)
  {
    fixtureLabel: "Flux vs Vortex (OT)",
    fixtureId: "cmsp9a74y000i4pkkwu4qb4gx",
    homeShortName: "FLUX",
    awayShortName: "VORTEX",
    homeScore: 37,
    awayScore: 45,
    sourceLabel: "FIBA Box Score FLU vs VTX 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 8, awayScore: 19 },
      { period: 2, label: "Q2", homeScore: 25, awayScore: 25 },
      { period: 3, label: "OT1", homeScore: 37, awayScore: 45 },
    ],
    home: {
      seasonClubShortName: "FLUX",
      totals: { points: 37, rebounds: 16, assists: 6, turnovers: 7, fouls: 10 },
      advanced: {
        pointsFromTurnovers: 9, pointsInPaint: 32, pointsInPaintMade: 16, pointsInPaintAttempted: 19,
        secondChancePoints: 6, fastBreakPoints: 4, fastBreakPointsFromTurnovers: 2, benchPoints: 19,
        biggestLead: 4, biggestScoringRun: 8, pointsPerPossession: 1.15, leadChanges: 5, timesTied: 4, timeWithLeadSeconds: 20,
      },
      players: [
        row("NWOKESAVIOUR", 0, [14, 14], [4, 9], [3, 5], [1, 4], [2, 2], 2, 2, 0, 0, 0, 0, 0, 1, -4, 10, 11),
        row("OPEMIPOSIOLUWAGBAMI", 3, [21, 0], [1, 6], [1, 1], [0, 5], [0, 2], 2, 0, 3, 2, 5, 0, 1, 1, -8, 3, 2),
        row("MUNACHIOKAFOR", 8, [10, 46], [3, 4], [3, 4], [0, 0], [0, 0], 3, 0, 1, 0, 0, 0, 4, 1, 3, 9, 6),
        row("ELEMCHIEBUKA", 15, [10, 14], [0, 0], [0, 0], [0, 0], [0, 0], 0, 1, 0, 0, 0, 0, 1, 0, -11, 1, 0),
        row("ONYEKAOGBOLU", 17, [17, 32], [3, 4], [3, 4], [0, 0], [0, 1], 0, 3, 0, 3, 1, 0, 2, 1, 1, 5, 6),
        dnp("OLAWUNIEMMANUEL", 20),
        row("OJAJUNIOLUWATOBI", 33, [21, 0], [5, 7], [5, 7], [0, 0], [0, 0], 1, 1, 2, 1, 2, 0, 1, 0, -8, 13, 10),
        row("OSUNMAKINDEOREMIPOSI", 45, [10, 14], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -11, 0, 0),
      ],
    },
    away: {
      seasonClubShortName: "VORTEX",
      totals: { points: 45, rebounds: 8, assists: 5, turnovers: 10, fouls: 5 },
      advanced: {
        pointsFromTurnovers: 5, pointsInPaint: 22, pointsInPaintMade: 11, pointsInPaintAttempted: 15,
        secondChancePoints: 0, fastBreakPoints: 5, fastBreakPointsFromTurnovers: 1, benchPoints: 0,
        biggestLead: 12, biggestScoringRun: 12, pointsPerPossession: 1.18, leadChanges: 5, timesTied: 4, timeWithLeadSeconds: 12 * 60 + 49,
      },
      players: [
        row("AFOLABIPECULIAR", 0, [4, 8], [0, 0], [0, 0], [0, 0], [0, 0], 0, 1, 1, 0, 0, 0, 0, 0, 0, 2, 0),
        row("IFEOLUWAOBASA", 3, [6, 6], [0, 1], [0, 1], [0, 0], [0, 0], 0, 1, 1, 2, 1, 0, 0, 0, 11, 0, 0),
        row("DENNISGODSWILL", 8, [21, 0], [4, 6], [3, 5], [1, 1], [6, 9], 1, 2, 0, 0, 1, 0, 1, 5, 8, 14, 15),
        row("RALUCHUKWUBRIAN", 15, [16, 52], [0, 2], [0, 2], [0, 0], [0, 0], 0, 0, 1, 3, 0, 0, 0, 0, 8, -4, 0),
        row("JOSEPHADESHINA", 17, [10, 46], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 0, 1, -3, -2, 0),
        row("NOUMANEJIRINADE", 20, [21, 0], [5, 5], [5, 5], [0, 0], [5, 5], 0, 0, 2, 1, 0, 0, 2, 3, 8, 16, 15),
        row("FAVOUREJELONU", 33, [21, 0], [6, 6], [5, 5], [1, 1], [2, 2], 0, 2, 0, 3, 1, 0, 2, 1, 8, 15, 15),
        row("VICTOREDET", 45, [4, 8], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0),
      ],
    },
  },
  // Game 11: Halo 13 - 24 Nova
  {
    fixtureLabel: "Halo vs Nova",
    fixtureId: "cmsp9a755000k4pkknteevnb6",
    homeShortName: "HALO",
    awayShortName: "NOVA",
    homeScore: 13,
    awayScore: 24,
    sourceLabel: "FIBA Box Score HALO vs NOV 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 4, awayScore: 12 },
      { period: 2, label: "Q2", homeScore: 13, awayScore: 24 },
    ],
    home: {
      seasonClubShortName: "HALO",
      totals: { points: 13, rebounds: 13, assists: 1, turnovers: 4, fouls: 4 },
      advanced: {
        pointsFromTurnovers: 3, pointsInPaint: 10, pointsInPaintMade: 5, pointsInPaintAttempted: 13,
        secondChancePoints: 4, fastBreakPoints: 2, fastBreakPointsFromTurnovers: 0, benchPoints: 0,
        biggestLead: 0, biggestScoringRun: 4, pointsPerPossession: 0.63, leadChanges: 1, timesTied: 1, timeWithLeadSeconds: 0,
      },
      players: [
        row("GRACEOLUTOSOYE", 0, [3, 16], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
        row("GINIKAEZE", 3, [6, 54], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 0, 0, -6, -2, 0),
        row("ADESHINAFUNMILAYO", 8, [12, 14], [0, 1], [0, 0], [0, 1], [1, 2], 0, 1, 1, 0, 0, 0, 0, 1, -8, 1, 1),
        row("ERICDIVINE", 15, [9, 50], [0, 1], [0, 0], [0, 1], [1, 2], 0, 1, 0, 2, 1, 0, 0, 2, -5, -1, 1),
        row("ABIGAILEFFIONG", 17, [14, 30], [0, 3], [0, 3], [0, 0], [0, 0], 2, 1, 0, 0, 0, 0, 2, 1, -6, 0, 0),
        row("FAVOURFRANKLIN", 20, [20, 0], [4, 6], [4, 6], [0, 0], [1, 2], 3, 3, 0, 1, 0, 0, 1, 1, -11, 11, 9),
        row("EMMANUELAMARACHI", 33, [20, 0], [1, 4], [1, 4], [0, 0], [0, 2], 0, 1, 0, 0, 0, 0, 1, 1, -11, -2, 2),
        row("YINKADAUDU", 45, [13, 16], [0, 3], [0, 3], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -8, -3, 0),
      ],
    },
    away: {
      seasonClubShortName: "NOVA",
      totals: { points: 24, rebounds: 11, assists: 5, turnovers: 4, fouls: 6 },
      advanced: {
        pointsFromTurnovers: 5, pointsInPaint: 18, pointsInPaintMade: 9, pointsInPaintAttempted: 13,
        secondChancePoints: 2, fastBreakPoints: 0, fastBreakPointsFromTurnovers: 0, benchPoints: 2,
        biggestLead: 15, biggestScoringRun: 7, pointsPerPossession: 1.08, leadChanges: 1, timesTied: 1, timeWithLeadSeconds: 18 * 60 + 35,
      },
      players: [
        row("OFFIONGSHARON", 0, [16, 6], [4, 4], [3, 3], [1, 1], [0, 0], 2, 1, 2, 0, 0, 0, 1, 0, 10, 14, 9),
        row("BAKAREOREOLUWA", 3, [3, 54], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 1, 0, 0, 0, 0, 3, -1, 0),
        row("OKECHUKWUSYLVIA", 8, [6, 19], [1, 1], [1, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 6, 2, 2),
        row("OYEKANAISHAT", 15, [20, 0], [4, 5], [4, 4], [0, 1], [0, 2], 0, 1, 0, 2, 0, 0, 1, 2, 11, 4, 8),
        row("TIKFAQBILA", 17, [20, 0], [1, 2], [1, 2], [0, 0], [1, 1], 0, 0, 2, 0, 1, 0, 2, 1, 11, 5, 3),
        row("OKAFORCHIDINMA", 20, [6, 28], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, 6, -1, 0),
        row("KEMEPADEPRECIOUS", 33, [13, 32], [1, 3], [1, 3], [0, 0], [0, 0], 0, 2, 1, 1, 0, 0, 0, 0, 5, 2, 2),
        row("RACHELJOHN", 45, [13, 41], [0, 2], [0, 1], [0, 1], [0, 2], 0, 1, 0, 0, 1, 0, 2, 1, 5, -2, 0),
      ],
    },
  },
  // Game 12: Surge 15 - 26 Vortex
  {
    fixtureLabel: "Surge vs Vortex",
    fixtureId: "cmsp9a75d000m4pkk5achuyne",
    homeShortName: "SURGE",
    awayShortName: "VORTEX",
    homeScore: 15,
    awayScore: 26,
    sourceLabel: "FIBA Box Score SUR vs VOR 15 August.pdf",
    periods: [
      { period: 1, label: "Q1", homeScore: 8, awayScore: 11 },
      { period: 2, label: "Q2", homeScore: 15, awayScore: 26 },
    ],
    home: {
      seasonClubShortName: "SURGE",
      totals: { points: 15, rebounds: 12, assists: 1, turnovers: 5, fouls: 6 },
      advanced: {
        pointsFromTurnovers: 3, pointsInPaint: 8, pointsInPaintMade: 4, pointsInPaintAttempted: 7,
        secondChancePoints: 1, fastBreakPoints: 4, fastBreakPointsFromTurnovers: 3, benchPoints: 2,
        biggestLead: 3, biggestScoringRun: 7, pointsPerPossession: 0.73, leadChanges: 5, timesTied: 1, timeWithLeadSeconds: 4 * 60 + 53,
      },
      players: [
        row("BENJAMINCHIBUZOR", 0, [20, 0], [2, 8], [2, 3], [0, 5], [2, 2], 0, 1, 0, 2, 0, 0, 1, 2, -11, -1, 6),
        row("ADAMOLADIPUPO", 3, [17, 52], [1, 5], [0, 3], [1, 2], [0, 0], 1, 0, 0, 1, 0, 0, 1, 0, -6, -1, 3),
        row("OLUBODUNDANIEL", 8, [4, 25], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0),
        row("KEHINDEBAMIDELE", 15, [12, 35], [1, 1], [1, 1], [0, 0], [1, 2], 1, 2, 1, 1, 1, 0, 0, 1, 0, 6, 3),
        row("TOBISTEPHEN", 17, [10, 58], [1, 1], [1, 1], [0, 0], [0, 0], 0, 1, 0, 0, 0, 0, 3, 0, -8, 3, 2),
        row("AGBOJOSHUA", 20, [16, 27], [0, 0], [0, 0], [0, 0], [1, 2], 0, 3, 0, 0, 1, 0, 0, 1, -14, 4, 1),
        row("SANNIGEORGE", 33, [15, 35], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 0, 0, -10, 0, 0),
        row("SHITTULANRE", 45, [2, 8], [0, 2], [0, 0], [0, 2], [0, 0], 0, 0, 0, 1, 1, 0, 1, 0, -5, -2, 0),
      ],
    },
    away: {
      seasonClubShortName: "VORTEX",
      totals: { points: 26, rebounds: 10, assists: 3, turnovers: 5, fouls: 4 },
      advanced: {
        pointsFromTurnovers: 7, pointsInPaint: 12, pointsInPaintMade: 6, pointsInPaintAttempted: 8,
        secondChancePoints: 0, fastBreakPoints: 4, fastBreakPointsFromTurnovers: 2, benchPoints: 0,
        biggestLead: 11, biggestScoringRun: 8, pointsPerPossession: 1.11, leadChanges: 5, timesTied: 1, timeWithLeadSeconds: 14 * 60,
      },
      players: [
        row("AFOLABIPECULIAR", 0, [9, 54], [0, 0], [0, 0], [0, 0], [0, 0], 0, 1, 0, 0, 0, 0, 0, 0, 8, 1, 0),
        row("IFEOLUWAOBASA", 3, [10, 6], [3, 3], [2, 2], [1, 1], [0, 0], 0, 0, 0, 0, 0, 0, 1, 0, 3, 7, 7),
        row("DENNISGOODSWILL", 8, [20, 0], [1, 2], [1, 1], [0, 1], [5, 6], 0, 3, 0, 2, 0, 0, 2, 3, 11, 6, 7),
        row("RALUCHUKWUBRIAN", 15, [16, 19], [2, 2], [2, 2], [0, 0], [0, 0], 0, 0, 1, 0, 0, 0, 0, 0, 5, 5, 4),
        row("JOSEPHADESHINA", 17, [16, 19], [0, 2], [0, 2], [0, 0], [0, 0], 0, 0, 0, 0, 0, 0, 1, 1, 5, -2, 0),
        row("MOMAMEJIRINADA", 20, [3, 41], [0, 1], [0, 1], [0, 0], [0, 0], 0, 0, 0, 2, 1, 0, 0, 0, 6, -2, 0),
        row("FAVOUREJELONU", 33, [20, 0], [2, 5], [1, 2], [1, 3], [3, 4], 0, 0, 2, 1, 1, 0, 0, 2, 11, 6, 8),
        row("VICTOREDET", 45, [3, 41], [0, 0], [0, 0], [0, 0], [0, 0], 0, 0, 0, 0, 1, 0, 0, 0, 6, 1, 0),
      ],
    },
  },
];

function validateGame(g: (typeof GAMES)[number]): string[] {
  const errors: string[] = [];
  if (g.home.totals.points !== g.homeScore) errors.push(`${g.fixtureLabel}: home team totals.points (${g.home.totals.points}) != homeScore (${g.homeScore})`);
  if (g.away.totals.points !== g.awayScore) errors.push(`${g.fixtureLabel}: away team totals.points (${g.away.totals.points}) != awayScore (${g.awayScore})`);
  const lastPeriod = g.periods[g.periods.length - 1];
  if (lastPeriod.homeScore !== g.homeScore) errors.push(`${g.fixtureLabel}: last period home cumulative (${lastPeriod.homeScore}) != homeScore (${g.homeScore})`);
  if (lastPeriod.awayScore !== g.awayScore) errors.push(`${g.fixtureLabel}: last period away cumulative (${lastPeriod.awayScore}) != awayScore (${g.awayScore})`);
  for (const side of [g.home, g.away]) {
    for (const p of side.players) {
      if (p.twoPointsMade + p.threePointsMade !== p.fieldGoalsMade) {
        errors.push(`${g.fixtureLabel} ${side.seasonClubShortName} ${p.reportedName}: 2PM+3PM (${p.twoPointsMade + p.threePointsMade}) != FGM (${p.fieldGoalsMade})`);
      }
      if (p.twoPointsAttempted + p.threePointsAttempted !== p.fieldGoalsAttempted) {
        errors.push(`${g.fixtureLabel} ${side.seasonClubShortName} ${p.reportedName}: 2PA+3PA (${p.twoPointsAttempted + p.threePointsAttempted}) != FGA (${p.fieldGoalsAttempted})`);
      }
      const expectedPoints = p.twoPointsMade * 2 + p.threePointsMade * 3 + p.freeThrowsMade;
      if (expectedPoints !== p.points) {
        errors.push(`${g.fixtureLabel} ${side.seasonClubShortName} ${p.reportedName}: 2*2PM+3*3PM+FTM (${expectedPoints}) != PTS (${p.points})`);
      }
    }
    const summedPoints = side.players.reduce((sum, p) => sum + p.points, 0);
    if (summedPoints > side.totals.points) {
      errors.push(`${g.fixtureLabel} ${side.seasonClubShortName}: summed player points (${summedPoints}) exceeds team total (${side.totals.points})`);
    }
  }
  return errors;
}

async function main() {
  console.log(`Loaded ${GAMES.length} real Season Zero games to import.`);

  const allErrors = GAMES.flatMap(validateGame);
  if (allErrors.length > 0) {
    console.log(`\nVALIDATION FAILED — ${allErrors.length} issue(s), aborting before any writes:\n`);
    for (const e of allErrors) console.log("  " + e);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("Pre-flight arithmetic validation passed for all games.\n");

  let imported = 0;
  for (const g of GAMES) {
    const report = await importGameResult(g, ACTOR_ID);
    console.log(`${g.fixtureLabel}: ${report.status}${report.reason ? " - " + report.reason : ""}`);
    if (report.status === "BLOCKED") {
      console.log("home matches:", JSON.stringify(report.homeMatches));
      console.log("away matches:", JSON.stringify(report.awayMatches));
    } else {
      imported++;
    }
  }

  if (imported > 0) {
    const season = await prisma.season.findFirst({ where: { name: { contains: "Season Zero" } }, select: { id: true } });
    if (season) {
      await prisma.$transaction(async (tx) => {
        await recalculateStandings(tx, "cmt4odhgn0000wokk8fbwr6ro", season.id);
      });
      console.log(`\nStandings recalculated for season ${season.id}.`);
    }
  }

  console.log(`\nImported ${imported} / ${GAMES.length} games.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
