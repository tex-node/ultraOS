import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously listed every organization's athletes via the bare, unscoped
// client, with no permission gate beyond being logged in. Scoped to the acting user's own
// organization.
export default async function PlayersPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/players");
  const session = await requireSession();
  const canManage = hasPermission(session.user.roles, "player:manage");
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const athletes = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.athlete.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        registrations: {
          orderBy: { season: { startDate: "desc" } },
          include: {
            season: { select: { name: true } },
            seasonClub: { include: { club: { select: { name: true, shortName: true } }, division: { select: { name: true } } } },
          },
        },
      },
    }),
  );
  return <OperationsShell user={session.user}><main className="mx-auto max-w-7xl px-6 py-10">
    <div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-emerald-400">Permanent identity and season registration</p><h1 className="mt-2 text-3xl font-semibold">Athletes and players</h1></div>
      {canManage ? <Link className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950" href="/players/new">Create athlete</Link> : null}</div>
    <div className="mt-8 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b100e]">
      {athletes.map(a => { const p=a.registrations[0]; return <Link key={a.id} href={`/players/${a.id}`} className="grid gap-3 border-b border-white/[.06] p-5 last:border-0 hover:bg-white/[.025] md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div><p className="font-semibold">{a.firstName} {a.lastName}</p><p className="text-xs text-zinc-500">Athlete · {a.nationality ?? "Nationality not set"}</p></div>
        <div><p className="text-xs text-zinc-500">Latest season</p><p className="mt-1 text-sm">{p?.season.name ?? "Not registered"}</p></div>
        <div><p className="text-xs text-zinc-500">SeasonClub</p><p className="mt-1 text-sm">{p?.seasonClub ? `${p.seasonClub!.club.name} · ${p.seasonClub!.division.name}` : "Unassigned"}</p></div>
        <div><p className="text-xs text-zinc-500">Player status</p><p className="mt-1 text-sm">{p?.status ?? "No registration"}</p></div>
      </Link>;})}
      {athletes.length===0 ? <p className="p-10 text-center text-zinc-400">No athletes registered.</p>:null}
    </div>
  </main></OperationsShell>;
}
