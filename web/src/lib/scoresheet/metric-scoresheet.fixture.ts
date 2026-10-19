// Shared fixture for the metric-scoresheet tests: a standard volleyball sheet and the definition-derived
// columns, so the tests exercise the same code path the review page does.
import { getSportDefinition } from "@/lib/sports/registry";
import { metricChecksums, metricColumns, type MetricScoresheet } from "./metric-scoresheet";

export const VOLLEYBALL_DEFINITION = (() => {
  const definition = getSportDefinition("volleyball");
  if (!definition) throw new Error("volleyball definition missing from the registry");
  return definition;
})();

export const VOL_BALL_ROWS = metricColumns(VOLLEYBALL_DEFINITION);

/** A fresh, mutable volleyball sheet: the same numbers the CSV verification uses. */
export function buildSheet(): MetricScoresheet {
  return {
    sportSlug: "volleyball",
    warnings: [],
    teams: [
      {
        clubName: "Surge",
        players: [
          { name: "Ada Nwosu", jersey: "4", metrics: { kills: 12, errors: 3, aces: 2, blocks: 1, digs: 7, assists: 0, points: 15 }, warnings: [] },
          { name: "Bode Ade", jersey: "7", metrics: { kills: 8, errors: 5, aces: 0, blocks: 2, digs: 4, assists: 1, points: 10 }, warnings: [] },
        ],
      },
      {
        clubName: "Vortex",
        players: [
          { name: "Chi Obi", jersey: "2", metrics: { kills: 9, errors: 4, aces: 1, blocks: 0, digs: 6, assists: 0, points: 10 }, warnings: [] },
        ],
      },
    ],
  };
}

export function check(sheet: MetricScoresheet) {
  return metricChecksums(sheet, VOLLEYBALL_DEFINITION);
}
