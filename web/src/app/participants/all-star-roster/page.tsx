import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { lockAllStarRosterAction, unlockAllStarRosterAction, updateAllStarPlayerAction } from "@/app/participants/all-star-roster/actions";
import { AddAllStarMemberForm } from "@/app/participants/all-star-roster/add-member-form";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { ALL_STAR_QUOTA_PER_TEAM, countByKindAndGender, getAllStarCandidatePool, getAllStarTeams } from "@/lib/all-star-teams";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AllStarRosterPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/participants/all-star-roster");
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const [teams, candidatePool] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    getAllStarTeams(tx),
    getAllStarCandidatePool(tx),
  ]));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link className="text-sm text-text-2" href="/coaches">Back to coach operations</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-brand-400">All-star exhibition</p>
        <h1 className="mt-2 text-3xl font-semibold">Zenith / Pulse rosters</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-2">
          Each team is built from currently-rostered players and currently-assigned coaches: 2 male + 2 female players,
          and 2 male + 2 female coaches. This is a lightweight roster record, separate from the Season Zero league
          Club/Player/Draft structure — it does not touch Applications, Athletes, or the draft pool.
        </p>

        <div className="mt-8">
          <AddAllStarMemberForm
            playersMale={candidatePool.playersMale}
            playersFemale={candidatePool.playersFemale}
            coachesMale={candidatePool.coachesMale}
            coachesFemale={candidatePool.coachesFemale}
          />
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {teams.map((team) => {
            const playersMaleCount = countByKindAndGender(team.players, "PLAYER", "MALE");
            const playersFemaleCount = countByKindAndGender(team.players, "PLAYER", "FEMALE");
            const coachesMaleCount = countByKindAndGender(team.players, "COACH", "MALE");
            const coachesFemaleCount = countByKindAndGender(team.players, "COACH", "FEMALE");
            const locked = Boolean(team.locked);
            const quotaMet = playersMaleCount === ALL_STAR_QUOTA_PER_TEAM && playersFemaleCount === ALL_STAR_QUOTA_PER_TEAM && coachesMaleCount === ALL_STAR_QUOTA_PER_TEAM && coachesFemaleCount === ALL_STAR_QUOTA_PER_TEAM;
            return (
            <section className="rounded-lg border border-line bg-ink-800 p-6" key={team.slug}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{team.name}</h2>
                {locked ? <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">LOCKED</span> : null}
              </div>
              <p className="text-xs text-text-3">
                Captain {typeof team.captain === "object" && team.captain && "name" in team.captain ? String((team.captain as { name: string }).name) : "-"}
              </p>
              <p className="mt-2 text-xs text-brand-300">
                Players {playersMaleCount}/{ALL_STAR_QUOTA_PER_TEAM} male · {playersFemaleCount}/{ALL_STAR_QUOTA_PER_TEAM} female
                {" · "}
                Coaches {coachesMaleCount}/{ALL_STAR_QUOTA_PER_TEAM} male · {coachesFemaleCount}/{ALL_STAR_QUOTA_PER_TEAM} female
              </p>

              <div className="mt-4">
                {locked ? (
                  <form action={unlockAllStarRosterAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="teamSlug" value={team.slug} />
                    <input name="reason" required minLength={5} placeholder="Reason for unlocking (required)" className="flex-1 rounded-lg bg-white/[.05] p-2 text-xs" />
                    <button className="rounded-lg border border-warn/30 px-3 py-2 text-xs text-warn">Unlock roster</button>
                  </form>
                ) : (
                  <form action={lockAllStarRosterAction}>
                    <input type="hidden" name="teamSlug" value={team.slug} />
                    <button className="rounded-lg border border-brand-400/40 px-3 py-2 text-xs text-brand-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={!quotaMet}>
                      {quotaMet ? "Lock roster" : "Lock roster (quota not met)"}
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {team.players.length === 0 ? <p className="text-sm text-text-3">No one added yet.</p> : null}
                {team.players.map((player) => (
                  <details className="rounded-md border border-line bg-ink-900 p-4" key={player.id}>
                    <summary className="cursor-pointer text-sm font-semibold text-text-1">
                      {player.fullName}
                      <span className="ml-2 rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-2">
                        {player.kind === "COACH" ? "Coach" : "Player"}{player.gender ? ` · ${player.gender === "MALE" ? "M" : "F"}` : ""}
                      </span>
                      <span className="ml-2 text-xs font-normal text-text-3">{player.phone ?? "No phone on file"}</span>
                    </summary>
                    <form action={updateAllStarPlayerAction.bind(null, team.slug, player.id)} className="mt-4 grid gap-3 md:grid-cols-2" inert={locked}>
                      <label className="block text-xs text-text-2">
                        Full name
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.fullName} name="fullName" />
                      </label>
                      <label className="block text-xs text-text-2">
                        Phone
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.phone ?? ""} name="phone" />
                      </label>
                      <label className="block text-xs text-text-2">
                        Position
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.position ?? ""} name="position" placeholder="e.g. Guard" />
                      </label>
                      <label className="block text-xs text-text-2">
                        Height (cm)
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.heightCm ?? ""} name="heightCm" type="number" />
                      </label>
                      <label className="block text-xs text-text-2">
                        Weight (kg)
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.weightKg ?? ""} name="weightKg" type="number" />
                      </label>
                      <label className="block text-xs text-text-2">
                        Stats (free text for now)
                        <input className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.stats ?? ""} name="stats" placeholder="e.g. 12 PPG, 5 RPG" />
                      </label>
                      <label className="block text-xs text-text-2 md:col-span-2">
                        Bio
                        <textarea className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-2 py-1.5 text-sm" defaultValue={player.bio ?? ""} name="bio" rows={2} />
                      </label>
                      <button className="rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs text-brand-300 md:col-span-2">
                        Save
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </section>
            );
          })}
        </div>
      </main>
    </OperationsShell>
  );
}
