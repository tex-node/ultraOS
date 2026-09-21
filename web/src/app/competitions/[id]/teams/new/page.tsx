import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { TeamForm } from "./team-form";

export const dynamic = "force-dynamic";

export default async function NewTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("club:manage", `/competitions/${id}/teams/new`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const competition = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id },
      include: { sport: true, divisions: { orderBy: { name: "asc" } }, seasons: { orderBy: { startDate: "desc" } } },
    }),
  );
  if (!competition) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href={`/competitions/${id}`} className="text-sm text-brand-400">← {competition.name}</Link>
        <h1 className="mt-4 text-2xl font-semibold">Add a team</h1>
        <p className="mt-1 text-sm text-text-2">
          Onboard a team into {competition.sport.name}. A Club, its season registration, and its competition
          Entrant are created together; add the roster afterwards.
        </p>
        <TeamForm
          competitionId={id}
          seasons={competition.seasons.map((season) => ({ id: season.id, name: season.name }))}
          divisions={competition.divisions.map((division) => ({ id: division.id, name: division.name }))}
        />
      </main>
    </OperationsShell>
  );
}
