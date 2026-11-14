import { parseBoxScoreCsv } from "./src/lib/scoresheet/csv-extract";
const SAMPLE = `# league: Lagos Basketball Community League
# season: 2026 Season
# date: 2026-09-20T16:46:00.000Z
# homeScore: 94
# awayScore: 16
# period: Q1,19,2
# period: Q2,15,9
## LEO KAREEM FOUNDATION
No,Player,Min,PTS,FG,2P,3P,FT,OR,DR,REB,AST,TO,STL,BLK,PF
4,MUSA ALFA,13:51,0,0-0,0-0,0-0,0-0,0,0,0,1,0,1,0,0
5,JOCHEN NWORIE,29:17,5,5-8,4-4,1-4,1-1,0,2,2,1,4,1,0,1
## SQUARE TEAM
2,BRAHIM MODIR,11:41,5,1-2,0-0,1-2,2-2,0,0,0,0,1,0,0,0
7,PETER OKEKE,15:32,27,2-3,0-0,2-3,1-1,2,1,3,2,0,0,0,2
`;
const p = parseBoxScoreCsv(SAMPLE);
console.log(JSON.stringify({ teams: p.teams.map(t => ({ name: t.clubName, players: t.players.map(pl => pl.name) })), warnings: p.warnings }, null, 1));