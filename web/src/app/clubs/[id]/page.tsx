import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { archiveClub, withdrawSeasonClub } from "@/app/clubs/actions";
import { uploadClubLogo } from "@/app/media/actions";
import { auth } from "@/auth";
import { MissingOrganizationContextError, requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

const FALLBACK_PRIMARY_COLOR = "#16F2B3";

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/clubs/${id}`);
  const session = await requireSession();
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const canManage = hasPermission(session.user.roles, "club:manage");
  const canUploadMedia = hasPermission(session.user.roles, "media:upload");
  const query = await searchParams;
  const club = await withOrganizationContext(session.user.organizationId, (tx) => tx.club.findUnique({
    where: { id },
    include: {
      sport: { select: { name: true } },
      fanClub: { include: { _count: { select: { memberships: true } } } },
      seasonClubs: {
        orderBy: { season: { startDate: "desc" } },
        include: {
          season: { include: { competition: { select: { name: true } } } },
          division: { select: { name: true } },
          headCoach: { select: { name: true } },
          assistantCoach: { select: { name: true } },
          teamManager: { select: { name: true } },
          scout: { select: { name: true } },
          fanCaptain: { select: { name: true } },
          standing: true,
          _count: {
            select: {
              players: true,
              homeFixtures: true,
              awayFixtures: true,
              draftPicks: true,
            },
          },
        },
      },
    },
  }));

  if (!club) {
    notFound();
  }

  const displayPrimaryColor = club.primaryColor ?? FALLBACK_PRIMARY_COLOR;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link className="text-sm text-zinc-400 hover:text-white" href="/clubs">
          ← Back to clubs
        </Link>
        <section
          className="relative mt-6 overflow-hidden rounded-2xl border p-6"
          style={{
            borderColor: `${displayPrimaryColor}35`,
            background: `linear-gradient(135deg, ${displayPrimaryColor}12, #0b100e 45%)`,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              {club.logoUrl ? (
                <img alt={`${club.name} logo`} className="h-20 w-20 rounded-2xl border object-contain p-2" src={club.logoUrl} style={{ borderColor: `${displayPrimaryColor}55`, background: `${displayPrimaryColor}15` }} />
              ) : (
                <div
                  className="grid h-20 w-20 place-items-center rounded-2xl border text-lg font-black"
                  style={{
                    color: displayPrimaryColor,
                    borderColor: `${displayPrimaryColor}55`,
                    background: `${displayPrimaryColor}15`,
                  }}
                >
                  {club.shortName}
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">
                  Permanent club identity
                </p>
                <h1 className="mt-2 text-3xl font-semibold">{club.name}</h1>
                <p className="mt-2 text-sm text-zinc-400">
                  {club.sport.name} · {club.status}
                  {club.foundedYear ? ` · Founded ${club.foundedYear}` : ""}
                </p>
                {club.officialSlogan ? <p className="mt-3 text-xl font-semibold" style={{ color: displayPrimaryColor }}>{club.officialSlogan}</p> : null}
                {club.crowdChant ? <p className="mt-1 text-sm text-zinc-300">Crowd chant: <b>{club.crowdChant}</b></p> : null}
                {club.identityKeywords.length ? <p className="mt-1 text-sm text-zinc-400">Identity: {club.identityKeywords.join(" / ")}</p> : null}
              </div>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:border-white/20"
                  href={`/clubs/${club.id}/edit`}
                >
                  Edit identity
                </Link>
                <Link
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300"
                  href={`/clubs/${club.id}/seasons/new`}
                >
                  Register in season
                </Link>
                {club.status !== "ARCHIVED" ? (
                  <form action={archiveClub.bind(null, club.id)}>
                    <button
                      className="rounded-xl border border-rose-400/20 px-4 py-2 text-sm text-rose-300 hover:bg-rose-400/10"
                      type="submit"
                    >
                      Archive club
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-zinc-500">Season history</p>
              <p className="mt-1 font-semibold">{club.seasonClubs.length} registrations</p>
            </div>
            <div>
              <p className="text-zinc-500">Fan base</p>
              <p className="mt-1 font-semibold">
                {club.fanClub?._count.memberships ?? 0} registered fans
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Website</p>
              <p className="mt-1 font-semibold">
                {club.websiteUrl ? (
                  <a className="text-emerald-400" href={club.websiteUrl}>
                    Visit
                  </a>
                ) : (
                  "Not set"
                )}
              </p>
            </div>
          </div>
        </section>

        {query.error === "active-registrations" ? (
          <p className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">
            Withdraw or deactivate all active SeasonClub registrations before
            archiving the permanent club.
          </p>
        ) : null}

        {canUploadMedia ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <h2 className="text-lg font-semibold">Club logo</h2>
            <p className="mt-1 text-sm text-zinc-400">Upload a JPG, PNG, or WebP logo. The media service validates image content before storage and updates the permanent Club identity.</p>
            <form action={uploadClubLogo.bind(null, club.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]" encType="multipart/form-data">
              <input accept="image/jpeg,image/png,image/webp" className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="file" required type="file" />
              <input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="altText" placeholder="Alt text, e.g. club logo" />
              <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Upload logo</button>
            </form>
          </section>
        ) : null}

        <section className="mt-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Competitive history
            </p>
            <h2 className="mt-2 text-xl font-semibold">SeasonClub registrations</h2>
          </div>
          <div className="mt-5 space-y-4">
            {club.seasonClubs.map((registration) => (
              <article
                key={registration.id}
                className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {registration.season.name} · {registration.division.name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {registration.season.competition.name} · SeasonClub ·{" "}
                      {registration.status}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <Link
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20"
                        href={`/season-clubs/${registration.id}/roster`}
                      >
                        View roster
                      </Link>
                      <Link
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-white/20"
                        href={`/season-clubs/${registration.id}/edit`}
                      >
                        Edit registration
                      </Link>
                      {registration.status !== "WITHDRAWN" ? (
                        <form
                          action={withdrawSeasonClub.bind(
                            null,
                            registration.id,
                            club.id,
                          )}
                        >
                          <button
                            className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300"
                            type="submit"
                          >
                            Withdraw
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-zinc-500">Roster</p>
                    <p className="mt-1 font-semibold">
                      {registration._count.players} players
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Head coach</p>
                    <p className="mt-1 font-semibold">
                      {registration.headCoach?.name ?? "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Fixtures</p>
                    <p className="mt-1 font-semibold">
                      {registration._count.homeFixtures +
                        registration._count.awayFixtures}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Record</p>
                    <p className="mt-1 font-semibold">
                      {registration.standing?.won ?? 0}-
                      {registration.standing?.lost ?? 0} ·{" "}
                      {registration.standing?.leaguePoints ?? 0} pts
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-white/[0.06] pt-4 text-xs text-zinc-400 sm:grid-cols-2 lg:grid-cols-5">
                  <p>Assistant: {registration.assistantCoach?.name ?? "Unassigned"}</p>
                  <p>Manager: {registration.teamManager?.name ?? "Unassigned"}</p>
                  <p>Scout: {registration.scout?.name ?? "Unassigned"}</p>
                  <p>Fan captain: {registration.fanCaptain?.name ?? "Unassigned"}</p>
                  <p>Draft picks: {registration._count.draftPicks}</p>
                </div>
              </article>
            ))}
            {club.seasonClubs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                This permanent club has no SeasonClub registrations.
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}
