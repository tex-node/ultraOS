import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createDraftSquad } from "@/app/draft-events/actions";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const input = "mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white";

export default async function NewDraftSquadPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/squads/new`);
  const session = await requirePermission("draft-squad:manage");
  const event = await prisma.draftEvent.findUnique({ where: { id: draftEventId }, include: { season: true } });
  if (!event) notFound();
  const divisions = await prisma.division.findMany({ where: { competitionId: event.season.competitionId }, orderBy: { name: "asc" } });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h1 className="text-2xl font-semibold">Create squad</h1>
          <form action={createDraftSquad.bind(null, event.id)} className="mt-8 space-y-5">
            <label className="block text-sm text-zinc-300">Name<input className={input} name="name" required /></label>
            <label className="block text-sm text-zinc-300">Public label<input className={input} name="publicLabel" /></label>
            <label className="block text-sm text-zinc-300">Division<select className={input} name="divisionId" required><option value="">Select</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>
            <label className="block text-sm text-zinc-300">Sequence<input className={input} name="sequence" type="number" min="1" required /></label>
            <label className="block text-sm text-zinc-300">Color<input className={input} name="color" placeholder="#16F2B3" /></label>
            <label className="block text-sm text-zinc-300">Icon URL<input className={input} name="iconUrl" /></label>
            <button className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Create squad</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}
