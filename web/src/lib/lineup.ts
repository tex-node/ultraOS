// Current on-court lineup derivation (G.16, Parts X-XIV). Pure functions only - the starting
// five plus an ordered list of structured substitution swaps (playerIn/playerOut pairs) is
// enough to deterministically reconstruct who is on court at any point, without ever guessing
// or inferring a starting lineup that was never explicitly confirmed.
export type LineupEntry = { seasonClubId: string; playerId: string };

export type SubstitutionRecord = {
  seasonClubId: string;
  playerInId: string;
  playerOutId: string;
  sequenceNumber: number;
};

// seasonClubId -> the set of playerIds currently on court for that team.
export type Lineup = Map<string, Set<string>>;

export function deriveLineup(startingFive: LineupEntry[], substitutions: SubstitutionRecord[]): Lineup {
  const onCourt: Lineup = new Map();
  for (const entry of startingFive) {
    if (!onCourt.has(entry.seasonClubId)) onCourt.set(entry.seasonClubId, new Set());
    onCourt.get(entry.seasonClubId)!.add(entry.playerId);
  }

  const ordered = [...substitutions].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const sub of ordered) {
    const set = onCourt.get(sub.seasonClubId);
    if (!set) continue; // No starting five recorded for this team - nothing to substitute within.
    set.delete(sub.playerOutId);
    set.add(sub.playerInId);
  }
  return onCourt;
}

export type SubstitutionValidationError =
  | "SAME_PLAYER_IN_AND_OUT"
  | "PLAYER_OUT_NOT_ON_COURT"
  | "PLAYER_IN_ALREADY_ON_COURT";

export type SubstitutionValidationResult = { valid: true } | { valid: false; error: SubstitutionValidationError };

// Validates one proposed swap against the lineup state derived so far. A duplicate submission
// of the same substitution is rejected for free by this same check - once a player has already
// been subbed out, they're no longer "on court," so subbing them out again fails
// PLAYER_OUT_NOT_ON_COURT without needing a separate duplicate-detection rule.
export function validateSubstitution(
  currentLineup: Lineup,
  seasonClubId: string,
  playerInId: string,
  playerOutId: string,
): SubstitutionValidationResult {
  if (playerInId === playerOutId) return { valid: false, error: "SAME_PLAYER_IN_AND_OUT" };
  const onCourt = currentLineup.get(seasonClubId) ?? new Set<string>();
  if (!onCourt.has(playerOutId)) return { valid: false, error: "PLAYER_OUT_NOT_ON_COURT" };
  if (onCourt.has(playerInId)) return { valid: false, error: "PLAYER_IN_ALREADY_ON_COURT" };
  return { valid: true };
}
