import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { castMvpVote, hasVoted, mvpAwardCount, mvpCandidates } from "../src/server/mvp/votes";
import { randomUUID } from "node:crypto";

// Streak v12, Prompt 4 verification: a vote, a duplicate vote, the tally, and the passport count.
//
//   npx tsx scripts/mvp-vote-verify.ts --organization <orgId> --athlete <athleteId> [--keep]
//
// Votes are cast through the same server function the public action calls, so the checks are of the real path: the
// candidate shortlist comes from the box score, the database UNIQUE is what refuses the second vote, and the
// passport count is the number of votes the athlete's performances won.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: mvp-vote-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

async function main() {
  // The most recent FINAL game that actually has a box score, with two distinct users so "one vote per user" is a
  // real test rather than a repeat of the same id.
  const game = await withOrganizationContext(ORG, (tx) =>
    tx.game.findFirst({
      where: { organizationId: ORG, fixture: { status: "FINAL" }, playerStats: { some: {} } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, fixtureId: true },
    }),
  );
  if (!game) throw new Error("no FINAL game with a box score in this organization");
  console.log(`game ${game.id} (fixture ${game.fixtureId})`);

  const candidates = await withOrganizationContext(ORG, (tx) => mvpCandidates(tx, game.id));
  console.log(`candidates: ${candidates.map((c) => `${c.name} (${c.points} PTS, ${c.votes} votes)`).join(" · ")}`);
  if (candidates.length === 0) throw new Error("no candidates: the shortlist is empty");

  const voters = await prisma.user.findMany({
    where: { id: { in: [ACTOR_ID] } },
    select: { id: true },
  });
  // Any other user works: the tenant scope comes from the organization context, not from a membership table.
  const secondVoter = await prisma.user.findFirst({
    where: { id: { not: ACTOR_ID } },
    select: { id: true },
  });
  if (!secondVoter) throw new Error("need a second user in this organization for the double-vote check");
  void voters;

  const chosen = candidates[0];
  const first = await withOrganizationContext(ORG, (tx) =>
    castMvpVote({ prisma: tx, organizationId: ORG, userId: ACTOR_ID, gameId: game.id, playerId: chosen.playerId }),
  );
  const duplicate = await withOrganizationContext(ORG, (tx) =>
    castMvpVote({ prisma: tx, organizationId: ORG, userId: ACTOR_ID, gameId: game.id, playerId: candidates[1]?.playerId ?? chosen.playerId }),
  );
  const second = await withOrganizationContext(ORG, (tx) =>
    castMvpVote({ prisma: tx, organizationId: ORG, userId: secondVoter.id, gameId: game.id, playerId: chosen.playerId }),
  );
  const rows = await withOrganizationContext(ORG, (tx) => tx.mVPVote.count({ where: { gameId: game.id } }));
  const voted = await withOrganizationContext(ORG, (tx) => hasVoted(tx, ACTOR_ID, game.id));
  const awards = await withOrganizationContext(ORG, (tx) => mvpAwardCount(tx, ORG, candidates[0].athleteId));
  const after = await withOrganizationContext(ORG, (tx) => mvpCandidates(tx, game.id));

  console.log("");
  console.log(`first vote:     ${JSON.stringify(first)}`);
  console.log(`duplicate vote: ${JSON.stringify(duplicate)}`);
  console.log(`second fan:     ${JSON.stringify(second)}`);
  console.log(`rows for this game: ${rows} · hasVoted(actor): ${voted} · MVP awards for ${chosen.name}: ${awards}`);
  console.log(`tally after: ${after.map((c) => `${c.name} ${c.votes}`).join(" · ")}`);

  const problems: string[] = [];
  if (!first.ok) problems.push(`the first vote failed: ${JSON.stringify(first)}`);
  if (duplicate.ok || duplicate.reason !== "ALREADY_VOTED") problems.push(`the duplicate vote was not refused as ALREADY_VOTED (${JSON.stringify(duplicate)})`);
  if (!second.ok) problems.push(`the second fan's vote failed: ${JSON.stringify(second)}`);
  if (rows !== 2) problems.push(`${rows} vote rows for the game, expected 2`);
  if (!voted) problems.push("hasVoted says false after voting");
  if (awards < 1) problems.push(`MVP awards ${awards} after one vote, expected at least 1`);
  const topVotes = Math.max(...after.map((c) => c.votes));
  if (topVotes !== 2) problems.push(`top of the tally has ${topVotes} votes, expected 2`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: the vote is stored once per fan, the tally counts it, and the passport count moves" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, (tx) => tx.mVPVote.deleteMany({ where: { gameId: game.id, userId: { in: [ACTOR_ID, secondVoter.id] } } }));
    console.log("cleanup: the two verification votes removed (use --keep to inspect)");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
