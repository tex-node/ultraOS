import type { ExtractedTeamTable } from "./extract";
import type { CorrectedPlayer, CorrectedTeam } from "../../server/scoresheet/imports";

// Shared by every path that validates a reviewed sheet (the IMAGE review action and the CSV upload):
// turn a corrected team into the same shape the extractor produces, so the checksum rules run over the
// numbers a human approved with exactly ONE implementation.

const cell = (value: number) => ({ raw: String(value), value, confidence: 100 });

export function correctedTeamToTable(team: CorrectedTeam): ExtractedTeamTable {
  return {
    teamLabel: team.clubName,
    headerRowIndex: 0,
    confidence: 100,
    warnings: [],
    totals: {
      points: cell(team.totals.points),
      reb: cell(team.totals.rebounds),
      assists: cell(team.totals.assists),
      turnovers: cell(team.totals.turnovers),
      fouls: cell(team.totals.fouls),
    },
    players: team.players.map((player: CorrectedPlayer, index: number) => ({
      rowIndex: index,
      jerseyNumber: player.jerseyNumber,
      name: player.name,
      minutesRaw: player.didNotPlay ? "DNP" : String(player.minutesPlayed),
      didNotPlay: player.didNotPlay,
      confidence: 100,
      cells: {
        points: cell(player.points),
        fgm: cell(player.fgm),
        fga: cell(player.fga),
        fg2m: cell(player.fg2m),
        fg2a: cell(player.fg2a),
        fg3m: cell(player.fg3m),
        fg3a: cell(player.fg3a),
        ftm: cell(player.ftm),
        fta: cell(player.fta),
        oreb: cell(player.oreb),
        dreb: cell(player.dreb),
        reb: cell(player.reb),
        assists: cell(player.assists),
        turnovers: cell(player.turnovers),
        steals: cell(player.steals),
        blocks: cell(player.blocks),
        fouls: cell(player.fouls),
      },
    })),
  };
}
