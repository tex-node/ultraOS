import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  completeDraftEvent,
  confirmAllocationAction,
  correctAllocationAction,
  pauseDraftEvent,
  reserveAllocationAction,
  resetRehearsalAction,
  revealAllocationAction,
  setDraftEventStage,
  startDraftEvent,
  startRehearsalDraftEvent,
  startSuspenseAction,
} from "@/app/draft-events/actions";
import { DraftEventOperatingMode, DraftEventStage } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { draftEventReadiness, nextAllocationReadiness, stageGenderHint, stageSubjectType } from "@/lib/draft-events";
import { withOrganizationContext } from "@/lib/tenant-context";

// The operator relies on this page reflecting the true DraftEvent state
// immediately after every action, never a cached render from before it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DraftControlPage({ params }: { params: Promise<{ draftEventId: string }> }) {
  const { draftEventId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/draft-events/${draftEventId}/control`);
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  const { event, readiness, divisions } = await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.draftEvent.findUnique({
      where: { id: draftEventId },
      include: {
        season: true,
        allocations: { include: { division: true, draftSquad: true, seasonClub: { include: { club: true } }, staff: true }, orderBy: { sequence: "asc" } },
      },
    });
    if (!event) return { event: null, readiness: [], divisions: [] };
    const [readiness, divisions] = await Promise.all([
      draftEventReadiness(tx, event.id),
      tx.division.findMany({ where: { competitionId: event.season.competitionId }, orderBy: { name: "asc" } }),
    ]);
    return { event, readiness, divisions };
  });
  if (!event) notFound();
  const current = event.currentAllocationId ? event.allocations.find((allocation) => allocation.id === event.currentAllocationId) : null;
  const subjectType = stageSubjectType(event.currentStage);
  const genderHint = stageGenderHint(event.currentStage);
  const isRehearsal = event.operatingMode === DraftEventOperatingMode.REHEARSAL;
  const eligibleDivisions = genderHint ? divisions.filter((division) => division.name.toLowerCase().includes(genderHint)) : [];
  const lockedDivision = eligibleDivisions.length === 1 ? eligibleDivisions[0] : null;
  const reserveReadiness = subjectType && lockedDivision
    ? await nextAllocationReadiness(organizationId, event.id, lockedDivision.id, subjectType, event.operatingMode)
    : null;
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Link className="text-sm text-emerald-400" href={`/draft-events/${event.id}`}>Back to event</Link><h1 className="mt-4 text-3xl font-semibold">Control room</h1><p className="mt-2 text-sm text-zinc-400">{event.status} - {event.operatingMode} - {event.currentStage.replaceAll("_", " ")} - display v{event.displaySequence}</p></div>
          <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm" href={`/draft-events/${event.id}/display?token=${event.displayToken}`}>Open public display</Link>
        </div>
        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <h2 className="text-xl font-semibold">Event controls</h2>
            <div className={isRehearsal ? "mt-4 rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100" : "mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100"}>
              <b>Mode: {event.operatingMode}</b>
              <p className="mt-1 text-zinc-300">
                {isRehearsal
                  ? "Rehearsal allocations are isolated and do not write Player.seasonClubId or SeasonClub coach assignments."
                  : "Live allocations write official roster and coach assignments when confirmed."}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <form action={startRehearsalDraftEvent.bind(null, event.id)}><button className="rounded-xl border border-sky-400/40 px-4 py-3 text-sm text-sky-100">Start / resume REHEARSAL</button></form>
              <form action={startDraftEvent.bind(null, event.id)}><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Start / resume LIVE</button></form>
              <form action={pauseDraftEvent.bind(null, event.id)}><button className="rounded-xl border border-white/10 px-4 py-3 text-sm">Pause</button></form>
              <form action={completeDraftEvent.bind(null, event.id)}><button className="rounded-xl border border-white/10 px-4 py-3 text-sm">Complete</button></form>
            </div>
            {isRehearsal ? (
              <form action={resetRehearsalAction.bind(null, event.id)} className="mt-4 grid gap-3 rounded-xl border border-white/[.08] bg-black/20 p-4 md:grid-cols-[1fr_auto]">
                <input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="reason" placeholder="Required reset reason" required />
                <button className="rounded-xl border border-rose-400/40 px-4 py-3 text-sm text-rose-100">Reset rehearsal allocations</button>
              </form>
            ) : null}
            <form action={setDraftEventStage.bind(null, event.id)} className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
              {/* key forces React to remount this select whenever the true stage
                  changes server-side. defaultValue is only honored on first mount —
                  without this key, after any action re-renders the page, the select
                  keeps whatever the browser last left it at instead of the real
                  current stage, so a stale value can get silently resubmitted. */}
              <select key={event.currentStage} className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="stage" defaultValue={event.currentStage}>{Object.values(DraftEventStage).map((stage) => <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>)}</select>
              <button className="rounded-xl border border-white/10 px-4 py-3 text-sm">Set stage</button>
            </form>
            {!subjectType || !genderHint ? (
              <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                Set the stage above to MEN COACH ALLOCATION, WOMEN COACH ALLOCATION, MEN SQUAD ALLOCATION, or WOMEN SQUAD ALLOCATION to enable Reserve. The current stage ({event.currentStage.replaceAll("_", " ")}) is a presentation-only stage.
              </p>
            ) : reserveReadiness && !reserveReadiness.canReserve ? (
              <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100">
                {reserveReadiness.reason} Move on to the next stage above when ready.
              </p>
            ) : (
              <form action={reserveAllocationAction.bind(null, event.id)} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                {lockedDivision ? (
                  <>
                    <input name="divisionId" type="hidden" value={lockedDivision.id} />
                    <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-300">{lockedDivision.name}</div>
                  </>
                ) : (
                  <select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="divisionId" required><option value="">Division</option>{eligibleDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select>
                )}
                <input name="subjectType" type="hidden" value={subjectType} />
                <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-300">{subjectType} (from stage)</div>
                <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">{isRehearsal ? "Reserve rehearsal allocation" : "Reserve official allocation"}</button>
              </form>
            )}
            {current ? (
              <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                <p className="text-xs uppercase tracking-[.2em] text-emerald-300">Current {current.operatingMode.toLowerCase()} allocation</p>
                <h3 className="mt-2 text-2xl font-semibold">{current.draftSquad?.name ?? current.staff?.name} to {current.seasonClub.club.name}</h3>
                <p className="mt-2 text-sm text-zinc-400">{current.status} - {current.division.name}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <form action={startSuspenseAction.bind(null, event.id, current.id)}><button className="rounded-xl border border-white/10 px-4 py-3 text-sm">Start suspense</button></form>
                  <form action={revealAllocationAction.bind(null, event.id, current.id)}><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Reveal result</button></form>
                  <form action={confirmAllocationAction.bind(null, event.id, current.id)}><button className="rounded-xl border border-white/10 px-4 py-3 text-sm">{isRehearsal ? "Confirm rehearsal result" : "Confirm roster/coach assignment"}</button></form>
                </div>
                <form action={correctAllocationAction.bind(null, event.id, current.id)} className="mt-4 grid gap-2 border-t border-white/[.08] pt-4 md:grid-cols-[1fr_auto]">
                  <input className="rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-xs" name="reason" placeholder="Required reason to cancel this reservation before reveal" required />
                  <button className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs text-rose-100">Cancel this reservation</button>
                </form>
              </div>
            ) : null}
          </div>
          <aside className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <h2 className="font-semibold">Readiness</h2>
            <div className="mt-4 space-y-2">{readiness.slice(0, 8).map((item) => <p className="text-sm text-zinc-400" key={item.key}><span className={item.status === "RED" ? "text-rose-300" : item.status === "AMBER" ? "text-amber-300" : "text-emerald-300"}>{item.status}</span> {item.label}</p>)}</div>
            <p className="mt-6 text-xs text-zinc-500">Pedal mapping: Space should call suspense/reveal controls from this private route only. Server actions still own the result.</p>
          </aside>
        </section>
        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h2 className="text-xl font-semibold">Allocation history</h2>
          <div className="mt-4 grid gap-3">{event.allocations.map((allocation) => (
            <div className="rounded-xl border border-white/[.06] bg-black/20 p-4" key={allocation.id}>
              <p className="font-semibold">#{allocation.sequence} {allocation.draftSquad?.name ?? allocation.staff?.name} to {allocation.seasonClub.club.name}</p>
              <p className="text-xs text-zinc-500">{allocation.operatingMode} - {allocation.subjectType} - {allocation.status} - {allocation.division.name}</p>
              {allocation.status === "REVEALED" || allocation.status === "CONFIRMED" ? (
                <form action={correctAllocationAction.bind(null, event.id, allocation.id)} className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input className="rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-xs" name="reason" placeholder="Required correction reason" required />
                  <button className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-100">Correct this result</button>
                </form>
              ) : null}
            </div>
          ))}</div>
        </section>
      </main>
    </OperationsShell>
  );
}
