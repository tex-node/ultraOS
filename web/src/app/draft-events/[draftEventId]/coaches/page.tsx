import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { addCoachPoolEntry } from "@/app/draft-events/actions";
import { StaffRole } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DraftCoachPoolPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/coaches`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-coach-pool:manage");
  const { event, divisions, coaches } = await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.draftEvent.findUnique({ where: { id: draftEventId }, include: { season: true, coachPoolEntries: { include: { staff: true, division: true }, orderBy: [{ division: { name: "asc" } }, { sequence: "asc" }] } } });
    if (!event) return { event: null, divisions: [], coaches: [] };
    const [divisions, coaches] = await Promise.all([
      tx.division.findMany({ where: { competitionId: event.season.competitionId }, orderBy: { name: "asc" } }),
      tx.staff.findMany({ where: { role: { in: [StaffRole.HEAD_COACH, StaffRole.ASSISTANT_COACH] }, user: { roles: { some: { role: "COACH", revokedAt: null } } } }, orderBy: { name: "asc" } }),
    ]);
    return { event, divisions, coaches };
  });
  if (!event) notFound();
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href={`/draft-events/${event.id}`}>Back to event</Link>
        <h1 className="mt-4 text-3xl font-semibold">Coach pool</h1>
        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <form action={addCoachPoolEntry.bind(null, event.id)} className="grid gap-3 md:grid-cols-[1fr_1fr_100px_1fr_auto]">
            <select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="staffId" required><option value="">Coach</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select>
            <select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="divisionId" required><option value="">Division</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select>
            <input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="sequence" placeholder="Seq" type="number" />
            <input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="publicBio" placeholder="Approved public bio" />
            <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Add</button>
          </form>
        </section>
        <section className="mt-6 grid gap-3">
          {event.coachPoolEntries.map((entry) => <div className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4" key={entry.id}><p className="font-semibold">{entry.staff.name}</p><p className="text-sm text-zinc-400">{entry.division.name} - sequence {entry.sequence ?? "not set"}</p><p className="text-xs text-zinc-500">{entry.publicBio ?? "No public bio"}</p></div>)}
        </section>
      </main>
    </OperationsShell>
  );
}
