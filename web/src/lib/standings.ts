type FinalFixture = {
  homeSeasonClubId: string;
  awaySeasonClubId: string;
  homeScore: number;
  awayScore: number;
  winnerSeasonClubId: string | null;
};

export function calculateStandings(teamIds: string[], fixtures: FinalFixture[]) {
  const rows = new Map(teamIds.map((id) => [id, { played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }]));
  for (const fixture of fixtures) {
    const home = rows.get(fixture.homeSeasonClubId!); const away = rows.get(fixture.awaySeasonClubId!);
    if (!home || !away) continue;
    home.played++; away.played++; home.pointsFor += fixture.homeScore; home.pointsAgainst += fixture.awayScore;
    away.pointsFor += fixture.awayScore; away.pointsAgainst += fixture.homeScore;
    if (fixture.winnerSeasonClubId === fixture.homeSeasonClubId!) { home.won++; away.lost++; }
    else if (fixture.winnerSeasonClubId === fixture.awaySeasonClubId!) { away.won++; home.lost++; }
  }
  return new Map([...rows.entries()].map(([id, row]) => [id, {
    ...row,
    pointDifference: row.pointsFor - row.pointsAgainst,
    leaguePoints: row.won * 3,
  }]));
}

export function compareStandings(
  a: { leaguePoints:number; won:number; pointDifference:number; pointsFor:number; name:string },
  b: { leaguePoints:number; won:number; pointDifference:number; pointsFor:number; name:string },
) {
  return b.leaguePoints-a.leaguePoints || b.won-a.won || b.pointDifference-a.pointDifference ||
    b.pointsFor-a.pointsFor || a.name.localeCompare(b.name);
}
