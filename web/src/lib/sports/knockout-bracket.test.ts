import assert from "node:assert/strict";
import test from "node:test";
import { advanceKnockoutBracket } from "@/lib/sports/knockout-bracket";
import type { Prisma } from "@/generated/prisma/client";

type Row = {
  round: number | null;
  bracketPosition: number | null;
  status: string;
  winnerSeasonClubId: string | null;
  winnerEntrantId: string | null;
  scheduledAt: Date;
};

type Bye = { seasonClubId: string | null; entrantId: string | null };

function final(round: number, bracketPosition: number, winner: string): Row {
  return {
    round,
    bracketPosition,
    status: "FINAL",
    winnerSeasonClubId: winner,
    winnerEntrantId: null,
    scheduledAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function fakeTx(input: { format: string; rows: Row[]; byes?: Record<string, Bye> | null }) {
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    division: {
      findUniqueOrThrow: async () => ({
        knockoutByes: input.byes ?? null,
        competition: { format: input.format },
      }),
    },
    fixture: {
      findMany: async () => input.rows,
      findFirst: async () => null, // no scheduling clashes
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `new-${created.length}` };
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, created };
}

const fixture = {
  id: "fx-1",
  divisionId: "div-1",
  seasonId: "season-1",
  round: 1,
  scheduledAt: new Date("2026-01-01T00:00:00.000Z"),
  venueId: "venue-1",
};

test("a league division never advances a bracket", async () => {
  const { tx, created } = fakeTx({ format: "ROUND_ROBIN", rows: [final(1, 1, "a"), final(1, 2, "b")] });
  assert.deepEqual(await advanceKnockoutBracket(tx, "org-1", fixture), []);
  assert.equal(created.length, 0);
});

test("an unfinished round creates nothing", async () => {
  const { tx, created } = fakeTx({
    format: "KNOCKOUT",
    rows: [final(1, 1, "a"), { ...final(1, 2, "b"), status: "LIVE", winnerSeasonClubId: null }],
  });
  assert.deepEqual(await advanceKnockoutBracket(tx, "org-1", fixture), []);
  assert.equal(created.length, 0);
});

test("a completed round creates the next round from the winners", async () => {
  const { tx, created } = fakeTx({ format: "KNOCKOUT", rows: [final(1, 1, "a"), final(1, 2, "b")] });
  assert.deepEqual(await advanceKnockoutBracket(tx, "org-1", fixture), ["new-1"]);
  assert.equal(created.length, 1);
  const next = created[0];
  assert.equal(next.round, 2);
  assert.equal(next.bracketPosition, 1);
  assert.equal(next.homeSeasonClubId, "a");
  assert.equal(next.awaySeasonClubId, "b");
  assert.equal(next.status, "SCHEDULED");
  assert.equal(next.venueId, "venue-1");
  // Scheduled one day after the round-one fixtures, not on top of them.
  assert.equal((next.scheduledAt as Date).toISOString(), "2026-01-02T00:00:00.000Z");
});

test("a round-one bye advances straight into the next round", async () => {
  const { tx, created } = fakeTx({
    format: "KNOCKOUT",
    rows: [final(1, 2, "c")],
    byes: { "1": { seasonClubId: "a", entrantId: null } },
  });
  assert.deepEqual(await advanceKnockoutBracket(tx, "org-1", fixture), ["new-1"]);
  assert.equal(created[0].homeSeasonClubId, "a");
  assert.equal(created[0].awaySeasonClubId, "c");
});

test("an existing next-round fixture is not duplicated", async () => {
  const { tx, created } = fakeTx({
    format: "KNOCKOUT",
    rows: [final(1, 1, "a"), final(1, 2, "b"), { ...final(2, 1, "a"), status: "SCHEDULED", winnerSeasonClubId: null }],
  });
  assert.deepEqual(await advanceKnockoutBracket(tx, "org-1", fixture), []);
  assert.equal(created.length, 0);
});
