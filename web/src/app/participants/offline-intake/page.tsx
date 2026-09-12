import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  provisionOfflineIntakeAction,
  provisionPlayerOfflineIntakeAction,
  updateOfflineIntakeContactAction,
  updateOfflineIntakePlayerProfileAction,
} from "@/app/participants/offline-intake/actions";
import { OfflineIntakeForm } from "@/app/participants/offline-intake/offline-intake-form";
import { AdminOfflineIntakeStatus, ApplicationType, AthleteGender } from "@/generated/prisma/enums";
import { missingPlayerProfileFields, type PlayerProfile } from "@/lib/admin-offline-intake";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously read every organization's seasons and offline-intake records
// (names, emails, phones, player profile detail) via the bare, unscoped client. Scoped to the
// acting admin's own organization.
export default async function OfflineIntakePage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/participants/offline-intake");
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const [seasons, intakes] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.season.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    tx.adminOfflineIntake.findMany({ orderBy: { createdAt: "desc" } }),
  ]));
  const seasonNameById = new Map(seasons.map((season) => [season.id, season.name]));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link className="text-sm text-zinc-400" href="/coaches/assignments">Back to coach operations</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-emerald-400">Admin offline intake</p>
        <h1 className="mt-2 text-3xl font-semibold">Offline-recruited participants</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          For legitimate participants recruited outside the public Application workflow. This never fabricates an
          Application — it records how the person actually entered Ultra Basketball. Provisioning to a permanent
          Staff identity and Ultra Staff ID requires a real email; records without one stay in DRAFT until contact
          information is supplied.
        </p>

        <div className="mt-8">
          <OfflineIntakeForm seasons={seasons} />
        </div>

        <section className="mt-10 overflow-hidden rounded-2xl border border-white/[.08]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">Contact / Profile</th>
                <th className="p-4">Season / Division</th>
                <th className="p-4">Status</th>
                <th className="p-4">Provision</th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((intake) => {
                const isPlayer = intake.participantType === ApplicationType.PLAYER;
                const profile = (intake.playerProfile as PlayerProfile | null) ?? null;
                const missing = isPlayer ? missingPlayerProfileFields(profile) : [];
                return (
                  <tr className="border-t border-white/[.06]" key={intake.id}>
                    <td className="p-4">
                      <p className="font-semibold">{intake.fullName}</p>
                      <p className="text-xs text-zinc-500">Intake {intake.id}</p>
                      {intake.notes ? <p className="mt-1 text-xs text-zinc-600">{intake.notes}</p> : null}
                    </td>
                    <td className="p-4 text-zinc-300">{intake.participantType}</td>
                    <td className="p-4 text-zinc-300">
                      <p>{intake.email ?? <span className="text-amber-300">No email on file</span>}</p>
                      <p className="text-xs text-zinc-500">{intake.phone ?? "No phone on file"}</p>
                      {!isPlayer && intake.status === AdminOfflineIntakeStatus.DRAFT ? (
                        <form action={updateOfflineIntakeContactAction.bind(null, intake.id)} className="mt-2 grid gap-1">
                          <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="email" placeholder="Real email" type="email" />
                          <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="phone" placeholder="Phone (optional)" />
                          <button className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300">Save contact info</button>
                        </form>
                      ) : null}
                      {isPlayer && intake.status !== AdminOfflineIntakeStatus.PROVISIONED ? (
                        <div className="mt-2">
                          {missing.length > 0 ? (
                            <p className="text-xs text-amber-300">Missing: {missing.join(", ")}</p>
                          ) : (
                            <p className="text-xs text-emerald-300">Profile complete — ready to provision</p>
                          )}
                          <form action={updateOfflineIntakePlayerProfileAction.bind(null, intake.id)} className="mt-2 grid grid-cols-2 gap-1">
                            <select className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.gender ?? ""} name="gender">
                              <option value="">Gender</option>
                              {Object.values(AthleteGender).map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.dateOfBirth ?? ""} name="dateOfBirth" type="date" />
                            <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.dominantHand ?? ""} name="dominantHand" placeholder="Hand" />
                            <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.position ?? ""} name="position" placeholder="Position" />
                            <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.heightCm ?? ""} name="heightCm" placeholder="Height cm" type="number" />
                            <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" defaultValue={profile?.weightKg ?? ""} name="weightKg" placeholder="Weight kg" type="number" />
                            <button className="col-span-2 rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300">Save profile</button>
                          </form>
                        </div>
                      ) : null}
                    </td>
                    <td className="p-4 text-zinc-300">
                      <p>{intake.seasonId ? seasonNameById.get(intake.seasonId) ?? intake.seasonId : "-"}</p>
                      <p className="text-xs text-zinc-500">{intake.coachSeasonZeroDivision ?? "No division"} · {intake.coachSeasonZeroSelectionStatus.replaceAll("_", " ")}</p>
                    </td>
                    <td className="p-4">{intake.status.replaceAll("_", " ")}</td>
                    <td className="p-4">
                      {intake.status === AdminOfflineIntakeStatus.PROVISIONED ? (
                        <span className="text-xs text-emerald-300">
                          {isPlayer ? `Player ${intake.provisionedPlayerId}` : `Staff ${intake.provisionedStaffId}`}
                        </span>
                      ) : intake.status === AdminOfflineIntakeStatus.READY_FOR_PROVISIONING && isPlayer ? (
                        <form action={provisionPlayerOfflineIntakeAction.bind(null, intake.id)} className="grid gap-1">
                          <select className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="seasonId" required>
                            <option value="">Season</option>
                            {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                          </select>
                          <button className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950">Provision player</button>
                        </form>
                      ) : intake.status === AdminOfflineIntakeStatus.READY_FOR_PROVISIONING ? (
                        <form action={provisionOfflineIntakeAction.bind(null, intake.id)}>
                          <button className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950">Provision</button>
                        </form>
                      ) : (
                        <span className="text-xs text-amber-300">{isPlayer ? "Profile incomplete" : "Waiting on email"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {intakes.length === 0 ? <p className="p-6 text-center text-sm text-zinc-400">No offline intake records yet.</p> : null}
        </section>
      </main>
    </OperationsShell>
  );
}
