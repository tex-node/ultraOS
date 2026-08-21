// Player Identity Constraints (G.21, Part XXI, XXIII). Pure - never touches Prisma, never
// touches a face. Player identity for a vision candidate is narrowed using the same contextual
// evidence a human would use: which team, which jersey number, who's actually in the current
// lineup (reusing G.17's lineup reconstruction, never a second lineup engine) - never primarily
// from appearance.
export type RosterPlayer = { playerId: string; seasonClubId: string; jerseyNumber: number | null };

export type IdentityEvidence = {
  teamMatch: boolean;
  jerseyMatch: boolean | null; // null when no jersey candidate exists to compare
  lineupCompatible: boolean | null; // null when no current-lineup context is available
};

export type IdentityCandidate = { player: RosterPlayer; evidence: IdentityEvidence };

export type IdentityResolution = {
  candidates: IdentityCandidate[];
  // A single strong candidate only when exactly one roster player satisfies every available
  // constraint - this module never picks a "best guess" among several equally-plausible players.
  uniqueMatch: RosterPlayer | null;
};

export function resolvePlayerIdentityCandidates(input: {
  roster: RosterPlayer[];
  teamCandidateSeasonClubId: string | null;
  jerseyCandidateNumber: number | null;
  currentLineupPlayerIds: string[] | null; // null = no lineup context available for this moment
}): IdentityResolution {
  const { roster, teamCandidateSeasonClubId, jerseyCandidateNumber, currentLineupPlayerIds } = input;

  const candidates: IdentityCandidate[] = roster
    .filter((p) => teamCandidateSeasonClubId === null || p.seasonClubId === teamCandidateSeasonClubId)
    .map((player) => ({
      player,
      evidence: {
        teamMatch: teamCandidateSeasonClubId !== null && player.seasonClubId === teamCandidateSeasonClubId,
        jerseyMatch: jerseyCandidateNumber === null ? null : player.jerseyNumber === jerseyCandidateNumber,
        lineupCompatible: currentLineupPlayerIds === null ? null : currentLineupPlayerIds.includes(player.playerId),
      },
    }))
    // A jersey candidate that's known and doesn't match this player rules them out entirely -
    // this is a hard constraint, not weighted evidence, the same way it would be for a human.
    .filter((c) => c.evidence.jerseyMatch !== false)
    // Likewise for lineup: a player not currently on court cannot be who was just observed on
    // court, when lineup context is actually available.
    .filter((c) => c.evidence.lineupCompatible !== false);

  const uniqueMatch = candidates.length === 1 ? candidates[0].player : null;

  return { candidates, uniqueMatch };
}
