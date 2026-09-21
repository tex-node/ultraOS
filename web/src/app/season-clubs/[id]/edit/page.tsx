import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { updateSeasonClub } from "@/app/clubs/actions";
import { SeasonClubForm } from "@/app/clubs/season-club-form";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function EditSeasonClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const { id } = await params;

  const { registration, seasons, divisions, staff } = await withOrganizationContext(organizationId, async (tx) => {
    const registration = await tx.seasonClub!.findUnique({
      where: { id },
      include: {
        club: { select: { id: true, name: true, sportId: true } },
      },
    });

    if (!registration) {
      return { registration: null, seasons: [], divisions: [], staff: [] };
    }

    const [seasons, divisions, staff] = await Promise.all([
      tx.season.findMany({
        where: { competition: { sportId: registration.club.sportId } },
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          name: true,
          competitionId: true,
          competition: { select: { name: true } },
        },
      }),
      tx.division.findMany({
        where: {
          competition: { sportId: registration.club.sportId },
          isActive: true,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, competitionId: true },
      }),
      tx.staff.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      }),
    ]);

    return { registration, seasons, divisions, staff };
  });

  if (!registration) {
    notFound();
  }

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          className="text-sm text-text-2 hover:text-white"
          href={`/clubs/${registration.club.id}`}
        >
          ← Back to club
        </Link>
        <div className="mt-6 rounded-lg border border-white/[0.08] bg-ink-800 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-400">
            Competitive registration
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Edit SeasonClub</h1>
          <div className="mt-8">
            <SeasonClubForm
              action={updateSeasonClub.bind(null, registration.id)}
              club={registration.club}
              seasons={seasons.map((season) => ({
                id: season.id,
                name: season.name,
                competitionId: season.competitionId,
                competitionName: season.competition.name,
              }))}
              divisions={divisions}
              staff={staff}
              registration={registration}
              submitLabel="Save SeasonClub"
            />
          </div>
        </div>
      </main>
    </OperationsShell>
  );
}
