import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { COMPETITION_FORMATS, formatLabel, resolveFormat } from "@/lib/sports/format";
import { withOrganizationContext } from "@/lib/tenant-context";
import { updateDivisionFormat } from "./actions";
import { FormatForm } from "./format-form";

export const dynamic = "force-dynamic";

// Format settings. Editable at the competition level, with an optional per-division override - a
// competition can run a league in one division and a knockout in another.
export default async function CompetitionSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("competition:manage", `/competitions/${id}/settings`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const competition = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id },
      include: { sport: true, divisions: { orderBy: { name: "asc" } } },
    }),
  );
  if (!competition) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href={`/competitions/${id}`} className="text-sm text-emerald-400">
          ← {competition.name}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Format</h1>
        <p className="mt-1 text-sm text-zinc-400">
          How fixtures are generated for {competition.sport.name} and whether a level score is a valid final
          result. Changing this affects fixtures generated afterwards — it does not re-shape an existing
          schedule, so regenerate the schedule to apply it.
        </p>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Competition default</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Currently {formatLabel(resolveFormat({ competitionFormat: competition.format }).format)}
            {competition.format === "GROUP_STAGE" ? ` · ${competition.groupCount} groups` : ""}.
          </p>
          <FormatForm competitionId={competition.id} format={competition.format} groupCount={competition.groupCount} />
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Divisions</h2>
          <p className="mt-1 text-sm text-zinc-400">
            An override applies to that division only. Leave it on “inherit” to follow the competition default.
          </p>
          {competition.divisions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No divisions yet.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {competition.divisions.map((division) => {
                const resolved = resolveFormat({
                  divisionFormat: division.format,
                  competitionFormat: competition.format,
                  divisionGroupCount: division.groupCount,
                  competitionGroupCount: competition.groupCount,
                });
                return (
                  <form
                    key={division.id}
                    action={updateDivisionFormat}
                    className="grid gap-3 rounded-xl border border-white/[.06] p-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="competitionId" value={competition.id} />
                    <input type="hidden" name="divisionId" value={division.id} />
                    <div>
                      <p className="text-sm font-semibold">{division.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Effective: {formatLabel(resolved.format)}
                        {resolved.format === "GROUP_STAGE" ? ` · ${resolved.groupCount} groups` : ""} (
                        {resolved.source.toLowerCase()})
                      </p>
                    </div>
                    <label className="text-xs text-zinc-400">
                      Format
                      <select
                        name="format"
                        defaultValue={division.format ?? "INHERIT"}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white"
                      >
                        <option value="INHERIT">Inherit</option>
                        {COMPETITION_FORMATS.map((value) => (
                          <option key={value} value={value}>
                            {formatLabel(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-zinc-400">
                      Groups
                      <input
                        name="groupCount"
                        type="number"
                        min={2}
                        max={16}
                        defaultValue={division.groupCount ?? ""}
                        placeholder="inherit"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <button className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
                      Save
                    </button>
                  </form>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
