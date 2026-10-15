import { positionGroup } from "./positions";

// Squad position/height setup (C3). Player.position and Player.heightCm are NOT NULL columns, so
// "no data" is stored as a placeholder ("Unknown", 0). The coaching engines already read those as
// UNKNOWN; this file is the one place that says what counts as usable, and validates edits.

export const POSITION_OPTIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type PositionOption = (typeof POSITION_OPTIONS)[number];

export const HEIGHT_MIN_CM = 140;
export const HEIGHT_MAX_CM = 230;

export const hasUsablePosition = (position: string | null | undefined): boolean => positionGroup(position) !== "UNKNOWN";
// 0 (and anything outside the believable range) is a placeholder, not a measurement.
export const hasUsableHeight = (heightCm: number | null | undefined): boolean => heightCm != null && heightCm >= HEIGHT_MIN_CM && heightCm <= HEIGHT_MAX_CM;

// Banner rule: show it while MORE than half the squad has no usable position.
export function squadNeedsPositions(players: readonly { position: string | null }[]): boolean {
  if (players.length === 0) return false;
  return players.filter((p) => !hasUsablePosition(p.position)).length * 2 > players.length;
}

export const SQUAD_SETUP_BANNER = "Set positions to compare players with their position peers.";

export type SquadSetupRowInput = { playerId: string; position: string | null; heightCm: number | null };
export type SquadSetupErrors = Record<string, { position?: string; heightCm?: string }>;
export type SquadSetupParse = { ok: true; rows: SquadSetupRowInput[] } | { ok: false; errors: SquadSetupErrors };

export const positionField = (playerId: string) => `position:${playerId}`;
export const heightField = (playerId: string) => `height:${playerId}`;

// Blank position/height means "leave as is" (the columns cannot be emptied). Unknown player ids in
// the form are ignored, never trusted: only ids in `playerIds` (the club's roster) are read.
export function parseSquadSetup(values: Record<string, string | undefined>, playerIds: readonly string[]): SquadSetupParse {
  const rows: SquadSetupRowInput[] = [];
  const errors: SquadSetupErrors = {};
  for (const playerId of playerIds) {
    const rawPosition = (values[positionField(playerId)] ?? "").trim();
    const rawHeight = (values[heightField(playerId)] ?? "").trim();
    const rowErrors: { position?: string; heightCm?: string } = {};

    let position: string | null = null;
    if (rawPosition !== "") {
      if ((POSITION_OPTIONS as readonly string[]).includes(rawPosition)) position = rawPosition;
      else rowErrors.position = `Choose one of ${POSITION_OPTIONS.join(", ")}.`;
    }

    let heightCm: number | null = null;
    if (rawHeight !== "") {
      const n = Number(rawHeight);
      if (!Number.isInteger(n) || n < HEIGHT_MIN_CM || n > HEIGHT_MAX_CM) rowErrors.heightCm = `Enter ${HEIGHT_MIN_CM}-${HEIGHT_MAX_CM} cm, or leave empty.`;
      else heightCm = n;
    }

    if (rowErrors.position || rowErrors.heightCm) errors[playerId] = rowErrors;
    else rows.push({ playerId, position, heightCm });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rows };
}

// Only rows that actually change something are written (and audited).
export function changedSquadRows(
  rows: readonly SquadSetupRowInput[],
  current: ReadonlyMap<string, { position: string | null; heightCm: number | null }>,
): SquadSetupRowInput[] {
  return rows.filter((r) => {
    const c = current.get(r.playerId);
    if (!c) return false;
    return (r.position != null && r.position !== c.position) || (r.heightCm != null && r.heightCm !== c.heightCm);
  });
}
