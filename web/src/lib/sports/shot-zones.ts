// Shot zones for the statistician click-to-log court. Pure functions only.
//
// Coordinate space is feet on a 50 x 94 court with a single basket at (25, 5.25) - the console
// renders one attacking half and both teams shoot at the same drawn basket, so the stored (x, y)
// is always relative to the basket being attacked. The server derives the zone from the stored
// coordinates with this same function, so the console preview and the ledger can never disagree.

export const COURT_WIDTH_FT = 50;
export const COURT_LENGTH_FT = 94;
export const BASKET_X_FT = 25;
export const BASKET_Y_FT = 5.25;
export const HALF_COURT_Y_FT = 47;

export type ShotZone =
  | "RESTRICTED_AREA"
  | "PAINT"
  | "MID_RANGE"
  | "CORNER_3"
  | "ABOVE_BREAK_3"
  | "BACKCOURT"
  | "FREE_THROW";

export const SHOT_ZONES: ShotZone[] = [
  "RESTRICTED_AREA",
  "PAINT",
  "MID_RANGE",
  "CORNER_3",
  "ABOVE_BREAK_3",
  "BACKCOURT",
  "FREE_THROW",
];

export function isOnCourt(x: number, y: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= COURT_WIDTH_FT &&
    y >= 0 &&
    y <= COURT_LENGTH_FT
  );
}

export function shotDistanceFt(x: number, y: number): number {
  return Math.hypot(x - BASKET_X_FT, y - BASKET_Y_FT);
}

// FREE_THROW is never returned here - the server assigns it to free throws logged without
// coordinates, since those are always taken from the line rather than clicked on the court.
export function shotZone(x: number, y: number): Exclude<ShotZone, "FREE_THROW"> {
  if (y > HALF_COURT_Y_FT) return "BACKCOURT";
  const distance = shotDistanceFt(x, y);
  if (distance <= 4) return "RESTRICTED_AREA";
  if (x >= 17 && x <= 33 && y <= 19) return "PAINT";
  const corner = (x <= 3 || x >= COURT_WIDTH_FT - 3) && y <= 14;
  if (distance >= 22) return corner ? "CORNER_3" : "ABOVE_BREAK_3";
  return "MID_RANGE";
}

export function isThreePointZone(zone: ShotZone): boolean {
  return zone === "CORNER_3" || zone === "ABOVE_BREAK_3";
}