import type { PositionGroup } from "./config";

// Player.position is free text (application form + imports accept "PG", "Point Guard",
// "power forward", combos like "PG/SG"). Map the first listed position to a peer group.
export function positionGroup(position: string | null | undefined): PositionGroup {
  if (!position) return "UNKNOWN";
  const first = position.toUpperCase().split(/[\/,&]| OR /)[0].trim();
  if (!first) return "UNKNOWN";
  if (/^(PG|SG|G)$/.test(first) || first.includes("GUARD")) return "GUARD";
  if (/^(PF|C|F-C|BIG)$/.test(first) || first.includes("POWER") || first.includes("CENTER") || first.includes("CENTRE")) return "BIG";
  if (/^(SF|F|W|WING)$/.test(first) || first.includes("FORWARD") || first.includes("WING")) return "WING";
  return "UNKNOWN";
}

export const POSITION_GROUP_LABEL: Record<PositionGroup, string> = {
  GUARD: "Guards",
  WING: "Wings",
  BIG: "Bigs",
  UNKNOWN: "All players",
};
