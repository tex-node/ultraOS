import { auth } from "@/auth";
import { submitWellWish } from "./actions";
import { canViewAnnouncement, currentLagosYearMonth, getViewerClubMemberships } from "@/lib/announcements";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function PublicCelebrationsPage() {
  const session = await auth();
  const { year, month } = currentLagosYearMonth();
  const organization = await resolveDefaultPublicOrganization();

  const { viewerClubIds, announcements } = await withOrganizationContext(organization.id, async (tx) => ({
    viewerClubIds: await getViewerClubMemberships(session?.user?.id, tx),
    announcements: await tx.announcement.findMany({
      where: { celebrationYear: year, status: "PUBLISHED" },
      include: {
        player: { include: { athlete: true, seasonClub: { include: { club: true } } } },
        wellWishes: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" } },
      },
    }),
  }));

  const celebrants = announcements
    .filter((announcement) => announcement.player.athlete.dateOfBirth.getUTCMonth() + 1 === month)
    .filter((announcement) => canViewAnnouncement(announcement.visibility, announcement.visibilityClubId, viewerClubIds))
    .sort((a, b) => a.player.athlete.dateOfBirth.getUTCDate() - b.player.athlete.dateOfBirth.getUTCDate());

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Celebrations</p>
      <h1 className="mt-2 text-4xl font-semibold">{MONTH_NAMES[month - 1]} celebrants</h1>
      <p className="mt-3 text-zinc-400">Wish this month&apos;s birthday players well.</p>

      {celebrants.length === 0 ? (
        <p className="mt-10 text-zinc-500">No celebrations to show yet this month.</p>
      ) : (
        <div className="mt-10 space-y-8">
          {celebrants.map((announcement) => (
            <section key={announcement.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {announcement.player.athlete.firstName} {announcement.player.athlete.lastName}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {MONTH_NAMES[month - 1]} {announcement.player.athlete.dateOfBirth.getUTCDate()} · {announcement.player.seasonClub?.club.name ?? "Ultra Basketball"}
                  </p>
                </div>
              </div>
              {announcement.message ? <p className="mt-4 text-emerald-300">{announcement.message}</p> : null}

              <div className="mt-6 border-t border-white/[.06] pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Well wishes</h3>
                {announcement.wellWishes.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">Be the first to send a well wish.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {announcement.wellWishes.map((wellWish) => (
                      <p key={wellWish.id} className="rounded-lg bg-white/[.04] p-3 text-sm">
                        <span className="text-emerald-300">{wellWish.authorName}:</span> {wellWish.message}
                      </p>
                    ))}
                  </div>
                )}
                <form action={submitWellWish.bind(null, announcement.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                  <input
                    name="authorName"
                    required
                    placeholder="Your name"
                    defaultValue={session?.user?.name ?? ""}
                    className="rounded-lg bg-white/[.05] p-3"
                  />
                  <input name="message" required placeholder="Leave a well wish" className="rounded-lg bg-white/[.05] p-3" />
                  <button className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950">Send</button>
                </form>
                <p className="mt-2 text-xs text-zinc-600">Well wishes are reviewed before they appear publicly.</p>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
