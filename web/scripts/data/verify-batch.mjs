import { readFileSync } from "node:fs";

const batch = JSON.parse(readFileSync(new URL("./lbcl-2026-batch1.json", import.meta.url), "utf8"));

let errors = 0;
for (const g of batch.games) {
  for (const side of ["home", "away"]) {
    const team = g[side];
    const sumPts = team.players.reduce((a, p) => a + p.points, 0);
    const sumAst = team.players.reduce((a, p) => a + p.assists, 0);
    const sumReb = team.players.reduce((a, p) => a + p.offensiveRebounds + p.defensiveRebounds, 0);
    const label = `${g.sourceLabel} / ${side} (${team.clubName})`;
    if (sumPts !== team.totals.points) {
      console.log(`PTS MISMATCH: ${label} sum=${sumPts} totals=${team.totals.points}`);
      errors++;
    }
    if (Math.abs(sumAst - team.totals.assists) > 0) {
      console.log(`AST diff (info): ${label} sum=${sumAst} totals=${team.totals.assists}`);
    }
    if (Math.abs(sumReb - team.totals.rebounds) > 0) {
      console.log(`REB diff (info): ${label} sum=${sumReb} totals=${team.totals.rebounds}`);
    }
  }
  // quarter sums vs final score
  for (const side of ["home", "away"]) {
    const key = side === "home" ? "homeScore" : "awayScore";
    const qSum = g.periods.reduce((a, p) => a + p[key], 0);
    if (qSum !== g[key]) {
      console.log(`QUARTER SUM MISMATCH: ${g.sourceLabel} / ${side} qSum=${qSum} final=${g[key]}`);
      errors++;
    }
  }
}
console.log(errors === 0 ? "\nAll PTS/quarter checksums pass." : `\n${errors} checksum errors found.`);
