import { OperationsShell } from "@/app/components/operations-shell";
import { createAnnouncement, moderateWellWish, updateAnnouncement } from "./actions";
import { currentLagosYearMonth, getCelebrantsForMonth } from "@/lib/announcements";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: "Public",
  FAN_ZONE_MEMBERS: "Any fan zone member",
  CLUB_FAN_ZONE: "One club's fan zone only",
};

export default async function AnnouncementsPage() {
  const session = await requirePermission("announcement:manage");
  const { year, month } = currentLagosYearMonth();

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
  const clubs = await prisma.club.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });

  const celebrants = season ? await getCelebrantsForMonth(season.id, year, month) : [];

  const announcements = await prisma.announcement.findMany({
    where: { celebrationYear: year },
    include: {
      player: { include: { athlete: true, seasonClub: { include: { club: true } } } },
      visibilityClub: true,
      wellWishes: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingWellWishes = await prisma.wellWish.findMany({
    where: { status: "PENDING" },
    include: { announcement: { include: { player: { include: { athlete: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-bold">Celebrant announcements</h1>
        <p className="mt-2 text-zinc-400">{MONTH_NAMES[month - 1]} {year} reminders, publishing controls, and well-wish moderation.</p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">This month&apos;s celebrants</h2>
          {!season ? (
            <p className="mt-3 text-zinc-500">No active season found.</p>
          ) : celebrants.length === 0 ? (
            <p className="mt-3 text-zinc-500">No players on active rosters have a birthday this month.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {celebrants.map((celebrant) => (
                <div key={celebrant.playerId} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <b>{celebrant.athleteName}</b>
                      <p className="text-xs text-zinc-500">
                        {MONTH_NAMES[month - 1]} {celebrant.birthDay} · {celebrant.clubName ?? "No club"} {celebrant.jerseyNumber ? `· #${celebrant.jerseyNumber}` : ""}
                      </p>
                    </div>
                    {celebrant.announcement ? (
                      <span className="rounded-full bg-white/[.06] px-3 py-1 text-xs text-emerald-300">
                        {celebrant.announcement.status} · {VISIBILITY_LABEL[celebrant.announcement.visibility]}
                      </span>
                    ) : null}
                  </div>
                  {!celebrant.announcement ? (
                    <form action={createAnnouncement} className="mt-4 grid gap-3 border-t border-white/[.06] pt-4 md:grid-cols-[2fr_1fr_1fr_auto]">
                      <input type="hidden" name="playerId" value={celebrant.playerId} />
                      <input name="message" placeholder="Optional message (e.g. Happy Birthday!)" className="rounded-lg bg-white/[.05] p-3 md:col-span-2" />
                      <select name="visibility" className="rounded-lg bg-white/[.05] p-3">
                        <option value="PUBLIC">Public</option>
                        <option value="FAN_ZONE_MEMBERS">Any fan zone member</option>
                        <option value="CLUB_FAN_ZONE">One club&apos;s fan zone</option>
                      </select>
                      <select name="visibilityClubId" className="rounded-lg bg-white/[.05] p-3">
                        <option value="">No club restriction</option>
                        {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                      </select>
                      <button className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950 md:col-span-4">Create announcement</button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Announcements this year</h2>
          {announcements.length === 0 ? (
            <p className="mt-3 text-zinc-500">No announcements created yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <b>{announcement.player.athlete.firstName} {announcement.player.athlete.lastName}</b>
                    <span className="text-xs text-zinc-500">
                      {announcement.player.seasonClub?.club.name ?? "No club"} · {announcement.wellWishes.filter((w) => w.status === "APPROVED").length} approved well wishes
                    </span>
                  </div>
                  <form action={updateAnnouncement} className="mt-4 grid gap-3 border-t border-white/[.06] pt-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    <input type="hidden" name="announcementId" value={announcement.id} />
                    <input name="message" defaultValue={announcement.message ?? ""} placeholder="Message" className="rounded-lg bg-white/[.05] p-3 md:col-span-2" />
                    <select name="status" defaultValue={announcement.status} className="rounded-lg bg-white/[.05] p-3">
                      <option value="DRAFT">Draft</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="HIDDEN">Hidden</option>
                    </select>
                    <select name="visibility" defaultValue={announcement.visibility} className="rounded-lg bg-white/[.05] p-3">
                      <option value="PUBLIC">Public</option>
                      <option value="FAN_ZONE_MEMBERS">Any fan zone member</option>
                      <option value="CLUB_FAN_ZONE">One club&apos;s fan zone</option>
                    </select>
                    <select name="visibilityClubId" defaultValue={announcement.visibilityClubId ?? ""} className="rounded-lg bg-white/[.05] p-3">
                      <option value="">No club restriction</option>
                      {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                    </select>
                    <button className="rounded-lg border border-emerald-400/30 px-4 py-3 text-emerald-400 md:col-span-5">Save changes</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Well wishes awaiting review ({pendingWellWishes.length})</h2>
          {pendingWellWishes.length === 0 ? (
            <p className="mt-3 text-zinc-500">Nothing pending.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pendingWellWishes.map((wellWish) => (
                <div key={wellWish.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                  <p className="text-xs text-zinc-500">
                    For {wellWish.announcement.player.athlete.firstName} {wellWish.announcement.player.athlete.lastName} · from {wellWish.authorName}
                  </p>
                  <p className="mt-2 text-sm">{wellWish.message}</p>
                  <div className="mt-4 flex gap-3">
                    <form action={moderateWellWish}>
                      <input type="hidden" name="wellWishId" value={wellWish.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">Approve</button>
                    </form>
                    <form action={moderateWellWish}>
                      <input type="hidden" name="wellWishId" value={wellWish.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <button className="rounded-lg border border-rose-400/20 px-4 py-2 text-sm text-rose-300">Reject</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
