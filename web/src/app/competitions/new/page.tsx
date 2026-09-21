import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganizationOrRedirect } from "@/lib/authorization";
import { listSportSummaries } from "@/lib/sports/registry";
import { TournamentWizard } from "./tournament-wizard";

export default async function NewTournamentPage() {
  const { session } = await requirePermissionWithOrganizationOrRedirect("competition:manage", "/competitions/new");
  const summaries = listSportSummaries();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/competitions" className="text-sm text-brand-400">
          ← Competitions
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Create a tournament</h1>
        <p className="mt-1 text-sm text-text-2">
          A guided setup: pick the sport, name the tournament and its first season, and add divisions.
        </p>
        <TournamentWizard summaries={summaries} />
      </main>
    </OperationsShell>
  );
}
