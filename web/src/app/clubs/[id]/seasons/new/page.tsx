import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { createSeasonClub } from "@/app/clubs/actions";
import { SeasonClubForm } from "@/app/clubs/season-club-form";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function NewSeasonClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("club:manage");
  const { id } = await params;
  const club = await prisma.club.findUnique({
    where: { id },
    select: { id: true, name: true, sportId: true },
  });

  if (!club) {
    notFound();
  }

  const [seasons, divisions, staff] = await Promise.all([
    prisma.season.findMany({
      where: { competition: { sportId: club.sportId } },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        competitionId: true,
        competition: { select: { name: true } },
      },
    }),
    prisma.division.findMany({
      where: { competition: { sportId: club.sportId }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, competitionId: true },
    }),
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link className="text-sm text-zinc-400 hover:text-white" href={`/clubs/${club.id}`}>
          ← Back to club
        </Link>
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0b100e] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">
            Competitive registration
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Register {club.name} in a season</h1>
          <div className="mt-8">
            <SeasonClubForm
              action={createSeasonClub}
              club={club}
              seasons={seasons.map((season) => ({
                id: season.id,
                name: season.name,
                competitionId: season.competitionId,
                competitionName: season.competition.name,
              }))}
              divisions={divisions}
              staff={staff}
              submitLabel="Create SeasonClub"
            />
          </div>
        </div>
      </main>
    </OperationsShell>
  );
}
