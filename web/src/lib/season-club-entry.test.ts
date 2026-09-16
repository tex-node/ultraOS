import assert from "node:assert/strict";
import test from "node:test";
import { ensureSeasonClubEntry } from "@/lib/season-club-entry";
import type { Prisma } from "@/generated/prisma/client";

type Row = Record<string, unknown>;

function fakeTx() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  const db = {
    clubs: [] as Row[],
    seasonClubs: [] as Row[],
    entrants: [] as Row[],
    standings: [] as Row[],
  };

  const tx = {
    club: {
      findFirst: async ({ where }: { where: { organizationId?: string; shortName?: string; id?: string } }) =>
        db.clubs.find(
          (club) =>
            (where.id === undefined || club.id === where.id) &&
            (where.organizationId === undefined || club.organizationId === where.organizationId) &&
            (where.shortName === undefined || club.shortName === where.shortName),
        ) ?? null,
      findFirstOrThrow: async (args: { where: { id: string; organizationId?: string } }) => {
        const found = await tx.club.findFirst(args);
        if (!found) throw new Error("club not found");
        return found;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("club"), ...data };
        db.clubs.push(row);
        return row;
      },
    },
    seasonClub: {
      findFirst: async ({ where }: { where: { seasonId?: string; clubId?: string; divisionId?: string } }) =>
        db.seasonClubs.find(
          (seasonClub) =>
            (where.seasonId === undefined || seasonClub.seasonId === where.seasonId) &&
            (where.clubId === undefined || seasonClub.clubId === where.clubId) &&
            (where.divisionId === undefined || seasonClub.divisionId === where.divisionId),
        ) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("sc"), ...data };
        db.seasonClubs.push(row);
        return row;
      },
    },
    entrant: {
      findFirst: async ({ where }: { where: { seasonClubId?: string } }) =>
        db.entrants.find((entrant) => entrant.seasonClubId === where.seasonClubId) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("ent"), ...data };
        db.entrants.push(row);
        return row;
      },
    },
    standing: {
      findFirst: async ({ where }: { where: { seasonId?: string; OR?: Array<{ entrantId?: string; seasonClubId?: string }> } }) =>
        db.standings.find((standing) => {
          if (where.seasonId !== undefined && standing.seasonId !== where.seasonId) return false;
          if (!where.OR) return true;
          return where.OR.some(
            (clause) =>
              (clause.entrantId !== undefined && standing.entrantId === clause.entrantId) ||
              (clause.seasonClubId !== undefined && standing.seasonClubId === clause.seasonClubId),
          );
        }) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("st"), ...data };
        db.standings.push(row);
        return row;
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, db };
}

const base = {
  organizationId: "org1",
  competitionId: "comp1",
  seasonId: "season1",
  divisionId: "div1",
  name: "Lagos Warriors",
  shortName: "LAGW",
  sportId: "sport1",
};

test("a new team creates club, season club, entrant and standing together", async () => {
  const { tx, db } = fakeTx();
  const result = await ensureSeasonClubEntry(tx, base);

  assert.deepEqual(result.created, { club: true, seasonClub: true, entrant: true, standing: true });
  assert.equal(db.clubs.length, 1);
  assert.equal(db.seasonClubs.length, 1);
  assert.equal(db.entrants.length, 1);
  assert.equal(db.standings.length, 1);
  assert.equal(db.entrants[0].type, "TEAM");
  assert.equal(db.entrants[0].seasonClubId, result.seasonClubId);
  assert.equal(db.standings[0].entrantId, result.entrantId);
  assert.equal(db.standings[0].seasonClubId, result.seasonClubId);
});

test("re-running the entry is idempotent and creates nothing new", async () => {
  const { tx, db } = fakeTx();
  const first = await ensureSeasonClubEntry(tx, base);
  const second = await ensureSeasonClubEntry(tx, base);

  assert.deepEqual(second.created, { club: false, seasonClub: false, entrant: false, standing: false });
  assert.equal(second.seasonClubId, first.seasonClubId);
  assert.equal(second.entrantId, first.entrantId);
  assert.equal(second.standingId, first.standingId);
  assert.equal(db.clubs.length, 1);
  assert.equal(db.seasonClubs.length, 1);
  assert.equal(db.entrants.length, 1);
  assert.equal(db.standings.length, 1);
});

test("a standing left by an older path is reused, not duplicated", async () => {
  const { tx, db } = fakeTx();
  // Simulate the club path's legacy row: a standing with a seasonClub but no entrant yet.
  db.standings.push({ id: "st-legacy", organizationId: "org1", seasonId: "season1", seasonClubId: "sc-legacy", entrantId: null });
  db.seasonClubs.push({ id: "sc-legacy", organizationId: "org1", seasonId: "season1", clubId: "club-x", divisionId: "div1" });
  db.clubs.push({ id: "club-x", organizationId: "org1", shortName: "LAGW" });

  const result = await ensureSeasonClubEntry(tx, base);

  assert.equal(result.standingId, "st-legacy");
  assert.equal(result.created.standing, false);
  assert.equal(db.standings.length, 1); // no duplicate
  assert.equal(result.created.entrant, true); // the missing half is filled in
});

test("creating a club without a sport is rejected", async () => {
  const { tx } = fakeTx();
  await assert.rejects(
    ensureSeasonClubEntry(tx, { ...base, sportId: undefined }),
    /sportId is required/,
  );
});
