import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError, requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

const FALLBACK_PRIMARY_COLOR = "#16F2B3";
const FALLBACK_SECONDARY_COLOR = "#071713";

export default async function ClubsPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/clubs");
  const session = await requireSession();
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const canManage = hasPermission(session.user.roles, "club:manage");
  const clubs = await withOrganizationContext(session.user.organizationId, (tx) => tx.club.findMany({
    include: {
      sport: { select: { name: true } },
      fanClub: { select: { _count: { select: { memberships: true } } } },
      seasonClubs: {
        orderBy: { season: { startDate: "desc" } },
        include: {
          season: { select: { name: true, status: true } },
          division: { select: { name: true } },
          headCoach: { select: { name: true } },
          standing: true,
          _count: { select: { players: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  }));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
              Permanent identities and season teams
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Clubs</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Club holds brand identity. SeasonClub represents a team competing in a
              specific season and division.
            </p>
          </div>
          {canManage ? (
            <Link
              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
              href="/clubs/new"
            >
              Create permanent club
            </Link>
          ) : null}
        </div>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clubs.map((club) => {
            const activeRegistration = club.seasonClubs.find(
              (registration) =>
                registration.status === "ACTIVE" && registration.season.status === "ACTIVE",
            );
            const displayPrimaryColor = club.primaryColor ?? FALLBACK_PRIMARY_COLOR;
            const displaySecondaryColor = club.secondaryColor ?? FALLBACK_SECONDARY_COLOR;

            return (
              <article
                key={club.id}
                className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b100e]"
              >
                <div
                  className="h-1"
                  style={{
                    background: `linear-gradient(90deg, ${displayPrimaryColor}, ${displaySecondaryColor})`,
                  }}
                />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="grid h-12 w-12 place-items-center rounded-xl border text-xs font-black"
                        style={{
                          color: displayPrimaryColor,
                          borderColor: `${displayPrimaryColor}55`,
                          background: `${displayPrimaryColor}12`,
                        }}
                      >
                        {club.shortName}
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold">{club.name}</h2>
                        <p className="text-xs text-zinc-500">
                          {club.sport.name} · permanent club
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-400">
                      {club.status}
                    </span>
                  </div>

                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Competitive registration
                    </p>
                    {activeRegistration ? (
                      <div className="mt-2">
                        <p className="font-medium text-white">
                          {activeRegistration.season.name} · {activeRegistration.division.name}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="text-zinc-500">Roster</p>
                            <p className="mt-1 font-semibold">
                              {activeRegistration._count.players}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Coach</p>
                            <p className="mt-1 truncate font-semibold">
                              {activeRegistration.headCoach?.name ?? "Unassigned"}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Record</p>
                            <p className="mt-1 font-semibold">
                              {activeRegistration.standing?.won ?? 0}-
                              {activeRegistration.standing?.lost ?? 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-400">
                        Not registered in an active season.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      {club.seasonClubs.length} season registration
                      {club.seasonClubs.length === 1 ? "" : "s"} ·{" "}
                      {club.fanClub?._count.memberships ?? 0} fans
                    </p>
                    <Link
                      className="text-sm font-semibold text-emerald-400 hover:text-emerald-300"
                      href={`/clubs/${club.id}`}
                    >
                      View club
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {clubs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-400">
            No permanent clubs have been created.
          </div>
        ) : null}
      </main>
    </OperationsShell>
  );
}
