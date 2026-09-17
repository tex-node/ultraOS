import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { COMPETITION_FORMATS, formatLabel, resolveFormat } from "@/lib/sports/format";
import { BASKETBALL_PRESETS, matchBasketballPreset } from "@/lib/sports/basketball-formats";
import { getSportDefinition } from "@/lib/sports/registry";
import { resolveSeasonRuleValues } from "@/lib/sports/rule-set-store";
import { withOrganizationContext } from "@/lib/tenant-context";
import { updateBasketballFormat, updateDivisionFormat } from "./actions";
import { FormatForm } from "./format-form";

export const dynamic = "force-dynamic";

// Format settings. Editable at the competition level, with an optional per-division override - a
// competition can run a league in one division and a knockout in another.
export default async function CompetitionSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("competition:manage", `/competitions/${id}/settings`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const data = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id },
      include: {
        sport: true,
        divisions: { orderBy: { name: "asc" } },
        seasons: { orderBy: { startDate: "desc" }, select: { id: true } },
      },
    });
    if (!competition) return null;

    // Which basketball format (if any) the competition's seasons are currently playing.
    const definition = getSportDefinition(competition.sport.slug);
    let basketballPreset: string | null = null;
    if (definition && competition.sport.slug === "basketball" && competition.seasons[0]) {
      const { values } = await resolveSeasonRuleValues(tx, {
        organizationId: session.user.organizationId as string,
        seasonId: competition.seasons[0].id,
        sportId: competition.sportId,
        definition,
      });
      basketballPreset = matchBasketballPreset(values)?.key ?? null;
    }
    return { competition, basketballPreset };
  });
  if (!data) notFound();
  const { competition, basketballPreset } = data;

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

        {competition.sport.slug === "basketball" ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h2 className="text-lg font-semibold">Basketball format</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Ultra Basketball is the league&apos;s own format (2 × 10, running clock, Ultra Time, four-point
              shot). Standard formats play four quarters with a stopped clock. This applies to every season
              of this competition; games freeze the format at kick-off.
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Current format: {basketballPreset ? BASKETBALL_PRESETS.find((preset) => preset.key === basketballPreset)?.label : "Custom / organisation default"}
            </p>
            <form action={updateBasketballFormat} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="competitionId" value={competition.id} />
              <label className="block text-sm text-zinc-300">
                Format
                <select
                  name="preset"
                  defaultValue={basketballPreset ?? "ULTRA"}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white"
                >
                  {BASKETBALL_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-zinc-500">
                  {BASKETBALL_PRESETS.find((preset) => preset.key === (basketballPreset ?? "ULTRA"))?.description}
                </span>
              </label>
              <button className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950">
                Save format
              </button>
            </form>
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Divisions</h2>          <p className="mt-1 text-sm text-zinc-400">
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
