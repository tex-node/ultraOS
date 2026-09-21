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
        <Link href="/fixtures" className="text-text-2">Back to fixtures</Link>
        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-8 text-center">
          <p className="text-xs uppercase tracking-[.2em] text-brand-400">
            {fixture.season.name} · {fixture.division.name}
          </p>
          <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-8">
            <div><p className="text-2xl font-semibold">{fixture.homeSeasonClub!.club.name}</p><p className="text-xs text-text-3">Home SeasonClub</p></div>
            <p className="text-text-3">VS</p>
            <div><p className="text-2xl font-semibold">{fixture.awaySeasonClub!.club.name}</p><p className="text-xs text-text-3">Away SeasonClub</p></div>
          </div>
          <p className="mt-8 text-text-2">{formatLagosDateTime(fixture.scheduledAt)} · {fixture.venue.name}</p>
          <p className="mt-2">{fixture.status}{fixture.game ? ` · Game ${fixture.game.status}` : ""}</p>
          {canManage ? (
            <div className="mt-6 flex justify-center gap-2">
              <Link href={`/fixtures/${id}/edit`} className="rounded-md border border-line px-4 py-2">Edit</Link>
              {!fixture.game && fixture.status === "SCHEDULED" ? <form action={postponeFixture.bind(null,id)}><button className="rounded-md border border-warn/20 px-4 py-2 text-warn">Postpone</button></form> : null}
              {!fixture.game && fixture.status !== "CANCELLED" ? <form action={cancelFixture.bind(null,id)}><button className="rounded-md border border-rose-400/20 px-4 py-2 text-danger">Cancel</button></form> : null}
              {fixture.status !== "CANCELLED" && fixture.status !== "POSTPONED" ? <Link href={`/games/${id}/live`} className="rounded-md bg-brand-400 px-4 py-2 font-semibold text-ink-900">Game center</Link> : null}
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Match officials</h2><span className={fixture.officials.length ? "text-brand-300" : "text-danger"}>{fixture.officials.length ? `${fixture.officials.length} assigned` : "Missing"}</span></div>
          <div className="mt-4 space-y-2">
            {fixture.officials.map((official) => (
              <div key={official.id} className="flex items-center justify-between rounded-md bg-white/[.04] p-3">
                <div><p>{official.name}</p><p className="text-xs text-text-3">{official.role}{official.phone ? ` · ${official.phone}` : ""}</p></div>
                {canManage ? <form action={removeFixtureOfficial.bind(null,official.id,id)}><button className="text-sm text-danger">Remove</button></form> : null}
              </div>
            ))}
          </div>
          {canManage ? (
            <form action={addFixtureOfficial.bind(null,id)} className="mt-5 grid gap-3 sm:grid-cols-4">
              <input name="name" required placeholder="Official name" className="rounded-lg bg-white/[.05] p-3" />
              <input name="role" required placeholder="Role" className="rounded-lg bg-white/[.05] p-3" />
              <input name="phone" placeholder="Phone" className="rounded-lg bg-white/[.05] p-3" />
              <button className="rounded-lg bg-brand-400 p-3 font-semibold text-ink-900">Assign official</button>
            </form>
          ) : null}
        </section>
      </main>
    </OperationsShell>
  );
}
