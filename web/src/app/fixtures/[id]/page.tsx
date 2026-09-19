import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  addFixtureOfficial,
  cancelFixture,
  postponeFixture,
  removeFixtureOfficial,
} from "../actions";
import { requireSession } from "@/lib/authorization";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function FixturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/fixtures/${id}`);
  const session = await requireSession();
  const canManage = hasPermission(session.user.roles, "fixture:manage");
  if (!session.user.organizationId) redirect(`/login?callbackUrl=/fixtures/${id}`);
  const fixture = await withOrganizationContext(session.user.organizationId, (tx) => tx.fixture.findUnique({
    where: { id },
    include: {
      homeSeasonClub: { include: { club: true } },
      awaySeasonClub: { include: { club: true } },
      season: true,
      division: true,
      venue: true,
      event: true,
      game: true,
      officials: { orderBy: [{ role: "asc" }, { name: "asc" }] },
    },
  }));
  if (!fixture) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/fixtures" className="text-zinc-400">Back to fixtures</Link>
        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-8 text-center">
          <p className="text-xs uppercase tracking-[.2em] text-emerald-400">
            {fixture.season.name} · {fixture.division.name}
          </p>
          <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-8">
            <div><p className="text-2xl font-semibold">{fixture.homeSeasonClub!.club.name}</p><p className="text-xs text-zinc-500">Home SeasonClub</p></div>
            <p className="text-zinc-500">VS</p>
            <div><p className="text-2xl font-semibold">{fixture.awaySeasonClub!.club.name}</p><p className="text-xs text-zinc-500">Away SeasonClub</p></div>
          </div>
          <p className="mt-8 text-zinc-400">{formatLagosDateTime(fixture.scheduledAt)} · {fixture.venue.name}</p>
          <p className="mt-2">{fixture.status}{fixture.game ? ` · Game ${fixture.game.status}` : ""}</p>
          {canManage ? (
            <div className="mt-6 flex justify-center gap-2">
              <Link href={`/fixtures/${id}/edit`} className="rounded-xl border border-white/10 px-4 py-2">Edit</Link>
              {!fixture.game && fixture.status === "SCHEDULED" ? <form action={postponeFixture.bind(null,id)}><button className="rounded-xl border border-amber-400/20 px-4 py-2 text-amber-300">Postpone</button></form> : null}
              {!fixture.game && fixture.status !== "CANCELLED" ? <form action={cancelFixture.bind(null,id)}><button className="rounded-xl border border-rose-400/20 px-4 py-2 text-rose-300">Cancel</button></form> : null}
              {fixture.status !== "CANCELLED" && fixture.status !== "POSTPONED" ? <Link href={`/games/${id}/live`} className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-zinc-950">Game center</Link> : null}
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Match officials</h2><span className={fixture.officials.length ? "text-emerald-300" : "text-rose-300"}>{fixture.officials.length ? `${fixture.officials.length} assigned` : "Missing"}</span></div>
          <div className="mt-4 space-y-2">
            {fixture.officials.map((official) => (
              <div key={official.id} className="flex items-center justify-between rounded-xl bg-white/[.04] p-3">
                <div><p>{official.name}</p><p className="text-xs text-zinc-500">{official.role}{official.phone ? ` · ${official.phone}` : ""}</p></div>
                {canManage ? <form action={removeFixtureOfficial.bind(null,official.id,id)}><button className="text-sm text-rose-300">Remove</button></form> : null}
              </div>
            ))}
          </div>
          {canManage ? (
            <form action={addFixtureOfficial.bind(null,id)} className="mt-5 grid gap-3 sm:grid-cols-4">
              <input name="name" required placeholder="Official name" className="rounded-lg bg-white/[.05] p-3" />
              <input name="role" required placeholder="Role" className="rounded-lg bg-white/[.05] p-3" />
              <input name="phone" placeholder="Phone" className="rounded-lg bg-white/[.05] p-3" />
              <button className="rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Assign official</button>
            </form>
          ) : null}
        </section>
      </main>
    </OperationsShell>
  );
}
