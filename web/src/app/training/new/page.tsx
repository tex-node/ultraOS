import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createTrainingSession } from "@/app/training/actions";
import { TrainingSessionType } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously read every organization's seasons/seasonClubs via the bare,
// unscoped client to populate these dropdowns. Scoped to the acting admin's own organization.
export default async function NewTrainingSessionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/training/new");
  if (!hasPermission(session.user.roles, "training:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const [seasons, seasonClubs] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([tx.season.findMany({ orderBy: { startDate: "desc" } }), tx.seasonClub!.findMany({ include: { club: true, division: true }, orderBy: { club: { name: "asc" } } })]));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-3xl font-semibold">New Training Session</h1><form action={createTrainingSession} className="mt-8 grid gap-4 rounded-lg border border-line bg-ink-800 p-6"><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="title" placeholder="Session title" required /><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="sessionType">{Object.values(TrainingSessionType).map((type) => <option key={type} value={type}>{type}</option>)}</select><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="occurredAt" type="datetime-local" required /><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="seasonId"><option value="">Season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="seasonClubId"><option value="">SeasonClub</option>{seasonClubs.map((club) => <option key={club.id} value={club.id}>{club.club.name} | {club.division.name}</option>)}</select><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="location" placeholder="Location" /><button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Create</button></form></main></OperationsShell>;
}
