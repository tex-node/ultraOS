import Link from "next/link";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

const FALLBACK_PRIMARY_COLOR = "#16F2B3";

export default async function Clubs() {
  // Phase 1 Stage 5.2D, Pattern D: this page carries no organization slug - explicit Neon Ultra
  // resolution, not the unset-RLS fallback. See resolveDefaultPublicOrganization()'s doc comment.
  const organization = await resolveDefaultPublicOrganization();
  const clubs = await withOrganizationContext(organization.id, (tx) => tx.club.findMany({
    where: { status: "ACTIVE" },
    include: {
      sport: true,
      seasonClubs: {
        where: { status: "ACTIVE" },
        include: {
          season: true,
          division: true,
          _count: { select: { players: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-4xl font-bold">Clubs</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {clubs.map((club) => {
          const displayPrimaryColor = club.primaryColor ?? FALLBACK_PRIMARY_COLOR;

          return (
            <Link
              href={`/public/clubs/${club.id}`}
              key={club.id}
              className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"
            >
              <div className="flex items-center gap-4">
                <div
                  className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl font-black"
                  style={{
                    color: displayPrimaryColor,
                    background: `${displayPrimaryColor}15`,
                  }}
                >
                  {club.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`${club.name} logo`}
                      className="h-full w-full object-contain p-1"
                      src={club.logoUrl}
                    />
                  ) : (
                    club.shortName
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{club.name}</h2>
                  <p className="text-xs text-zinc-500">Permanent {club.sport.name} club</p>
                </div>
              </div>
              <div className="mt-5 space-y-1 text-sm text-zinc-400">
                {club.seasonClubs.map((seasonClub) => (
                  <p key={seasonClub.id}>
                    {seasonClub.season.name} · {seasonClub.division.name} ·{" "}
                    {seasonClub._count.players} players
                  </p>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
