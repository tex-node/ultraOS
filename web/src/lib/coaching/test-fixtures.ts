import type { GameCore, PlayerLine, TeamSideStats } from "@/lib/analytics/types";

// Plain GameCore builders shared by component tests (the unit tests next to the engines keep their
// own local copies). Everything is a plain object: no database, no framework.

export type TeamSpec = {
  id: string;
  side?: Partial<TeamSideStats>;
  players: { id: string; stat?: Partial<PlayerLine> }[];
  periods?: [number, number]; // [first-half points, second-half points]
};

export function pline(id: string, club: string, s: Partial<PlayerLine> = {}): PlayerLine {
  return {
    playerId: id, name: id, jerseyNumber: null, photoUrl: null, seasonClubId: club, seasonClubShortName: club, side: "HOME", didNotPlay: false,
    minutesPlayed: 0, points: 10, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 2,
    fieldGoalsMade: 4, fieldGoalsAttempted: 9, twoPointsMade: 3, twoPointsAttempted: 6, threePointsMade: 1, threePointsAttempted: 3,
    freeThrowsMade: 3, freeThrowsAttempted: 4, offensiveRebounds: 1, defensiveRebounds: 3, foulsDrawn: null, plusMinus: null, efficiency: null,
    fourPointsMade: null, fourPointsAttempted: null, ultraTimePoints: null, ...s,
  };
}

function side(t: TeamSpec): TeamSideStats {
  const pts = t.players.reduce((s, p) => s + (p.stat?.points ?? 10), 0);
  return {
    seasonClubId: t.id, shortName: t.id, name: t.id, logoUrl: null, primaryColor: null, score: pts, rebounds: 20, assists: 10, turnovers: 10, fouls: 12,
    fieldGoalsMade: 20, fieldGoalsAttempted: 50, twoPointsMade: 15, twoPointsAttempted: 35, threePointsMade: 5, threePointsAttempted: 15,
    freeThrowsMade: 5, freeThrowsAttempted: 10, offensiveRebounds: 6, defensiveRebounds: 14, pointsFromTurnovers: null, pointsInPaint: null,
    pointsInPaintMade: null, pointsInPaintAttempted: null, secondChancePoints: null, fastBreakPoints: null, fastBreakPointsFromTurnovers: null,
    benchPoints: null, biggestLead: null, biggestScoringRun: null, pointsPerPossession: null, leadChanges: null, timesTied: null,
    timeWithLeadSeconds: null, fourPointsMade: null, fourPointsAttempted: null, ultraTimePointsFor: null, ultraTimePointsAgainst: null,
    ...t.side,
  };
}

let day = 0;
export function game(h: TeamSpec, a: TeamSpec): GameCore {
  const home = side(h);
  const away = side(a);
  const hp = h.periods ?? [Math.floor(home.score / 2), home.score - Math.floor(home.score / 2)];
  const ap = a.periods ?? [Math.floor(away.score / 2), away.score - Math.floor(away.score / 2)];
  day += 1;
  return {
    gameId: `g${day}`, fixtureId: `f${day}`, status: "FINAL", dataCapability: "BOX_SCORE_ONLY", divisionName: "Men", scheduledAt: new Date(Date.UTC(2026, 8, day)),
    home, away,
    players: [...h.players.map((p) => pline(p.id, h.id, p.stat)), ...a.players.map((p) => pline(p.id, a.id, p.stat))],
    periods: [
      { period: 1, label: "H1", homeScore: hp[0], awayScore: ap[0] },
      { period: 2, label: "H2", homeScore: hp[1], awayScore: ap[1] },
    ],
  } as GameCore;
}

// Round robin, `rounds` times: every team plays every other team once per round.
export function league(teams: TeamSpec[], rounds: number): GameCore[] {
  const out: GameCore[] = [];
  for (let r = 0; r < rounds; r++) for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) out.push(game(teams[i], teams[j]));
  return out;
}

export const plain = (id: string): TeamSpec => ({ id, players: [1, 2, 3, 4, 5].map((n) => ({ id: `${id}${n}` })) });
