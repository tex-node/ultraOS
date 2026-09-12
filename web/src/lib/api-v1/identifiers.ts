// Public identifier resolution (G.20, Part XV). Audited what stable external identity actually
// exists in this schema before designing the API around it:
//
// - Athlete: `ultraAthleteId` (UBA-XXXXXX) - a real, allocated, stable public identifier
//   (public-ids.ts), used for the API's player publicId.
// - Staff: `ultraStaffId` (UBS-XXXXXX) - same pattern, not used by this API (no public staff/
//   coach endpoint in this track's scope).
// - Club: no dedicated slug field exists. `shortName` is unique per organization
//   (`@@unique([organizationId, shortName])`) and therefore ambiguous in a multi-organization
//   platform. The current public v1 URL has no organization slug, so callers must run this
//   resolver inside the explicit default public organization context. Do not silently search
//   platform-wide.
// - Fixture / Game / Season: no dedicated public slug exists for any of these. Their raw cuid
//   `id` is used directly - this is NOT a new leak of an "opaque internal-only" id (Part XV's
//   concern): the existing public website already routes on these exact ids
//   (`/public/fixtures/[id]`, `/public/clubs/[id]`, `/public/players/[id]`), so they are already
//   the de facto public identifier, just not yet formalized as one for a versioned API. This is
//   documented honestly rather than pretending a slug exists where it doesn't.
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export async function resolveClubByPublicId(publicId: string, db: Db = prisma) {
  const clubs = await db.club.findMany({ select: { id: true, shortName: true } });
  const match = clubs.find((c) => c.shortName.toLowerCase() === publicId.toLowerCase());
  if (!match) return null;
  return db.club.findUnique({ where: { id: match.id } });
}

export async function resolvePlayerByPublicId(athletePublicId: string, seasonId?: string, db: Db = prisma) {
  const athlete = await db.athlete.findUnique({ where: { ultraAthleteId: athletePublicId } });
  if (!athlete) return null;
  const player = await db.player.findFirst({
    where: { athleteId: athlete.id, ...(seasonId ? { seasonId } : {}) },
    orderBy: { season: { startDate: "desc" } },
    include: { seasonClub: { include: { club: true } } },
  });
  if (!player) return null;
  return { athlete, player };
}

// "active" is accepted as a convenience alias for the current ACTIVE season, so a consumer never
// has to look up a season id just to ask "what are the current standings" - falls through to a
// literal Season.id lookup otherwise (Part XV: cuid is the real identifier where no slug exists).
export async function resolveSeasonByPublicId(publicId: string, db: Db = prisma) {
  if (publicId === "active") {
    return db.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
  }
  return db.season.findUnique({ where: { id: publicId } });
}

// Batch name/publicId resolution for a set of internal Player.id values (leaders, box score,
// events) - one query instead of N, and the only place these display fields are joined in for
// the public API.
export async function resolvePlayerNames(playerIds: string[], db: Db = prisma): Promise<Map<string, { name: string; publicId: string | null }>> {
  if (playerIds.length === 0) return new Map();
  const players = await db.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, athlete: { select: { firstName: true, lastName: true, ultraAthleteId: true } } },
  });
  return new Map(players.map((p) => [p.id, { name: `${p.athlete.firstName} ${p.athlete.lastName}`, publicId: p.athlete.ultraAthleteId }]));
}

export async function resolveFixtureByPublicId(publicId: string, db: Db = prisma) {
  return db.fixture.findUnique({
    where: { id: publicId },
    include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
  });
}
