import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { resolveDefaultPublicOrganization } from "@/lib/tenant-context";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadAthletePassport, type Provenance } from "@/server/players/passport";

export const dynamic = "force-dynamic";

// P15 I6 v1: the athlete passport. A longitudinal read-model view of one player: career timeline,
// aggregate stats, and - the point of the feature - a provenance badge on every row and aggregate so
// a reader knows whether a number came from a live console, an OCR-reviewed import, a hand
// transcription, or a coach's training log.
//
// PRIVACY: the page is authenticated (no public variant in v1). The training history and the adopted
// plans are shown ONLY to a viewer with a coaching/operations permission; everyone else sees the
// performance record and the provenance, not the coach-private evidence behind it.

const BADGE: Record<Provenance, { label: string; className: string }> = {
  LIVE: { label: "LIVE", className: "bg-brand-400/20 text-brand-300" },
  LIVE_STATISTICIAN: { label: "LIVE STAT", className: "bg-brand-400/20 text-brand-300" },
  OCR_REVIEWED: { label: "OCR REVIEWED", className: "bg-info/20 text-info" },
  IMPORTED: { label: "IMPORTED", className: "bg-ink-600 text-text-2" },
  MANUAL: { label: "MANUAL", className: "bg-warn/20 text-warn" },
  UNKNOWN: { label: "UNKNOWN", className: "bg-danger/20 text-danger" },
};

// Every badge carries its own explanation, both as a tooltip and as aria-label: "OCR REVIEWED" is only
// meaningful if a reader can find out what it means without leaving the page.
const BADGE_EXPLANATION: Record<Provenance, string> = {
  LIVE: "Recorded live by the Ultra scorer console during the game.",
  LIVE_STATISTICIAN: "Recorded live by the independent statistician console, or derived from its verified event ledger.",
  OCR_REVIEWED: "Data ingested from a historical scoresheet and human-verified in the review queue before it entered the league data.",
  IMPORTED: "Imported from a hand-transcribed batch or an external provider export; not verified against a live console.",
  MANUAL: "Entered by league staff, or a coach's training log - a person typed it, no automated capture.",
  UNKNOWN: "The source of this figure could not be established. Treat it with caution rather than assuming it is live.",
};

function Badge({ source }: { source: Provenance }) {
  const badge = BADGE[source];
  const explanation = BADGE_EXPLANATION[source];
  return (
    <span
      data-provenance={source}
      title={`${badge.label}: ${explanation}`}
      aria-label={`${badge.label} - ${explanation}`}
      className={`cursor-help rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function PlayerPassportPage({ params }: { params: Promise<{ id: string }> }) {
  // The segment is `[id]`, not `[playerId]`: /players/[id] already exists, and Next.js refuses two
  // different slug names for the same dynamic path at STARTUP (not at build time - this crashed
  // staging with a 500 on every route the first time it was deployed). The variable is renamed here
  // so the rest of the file still reads as "the player".
  const { id: playerId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/players/${playerId}/passport`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  // The passport belongs to the PLAYER's organization, which is not always the viewer's active one: the
  // public athlete page resolves the default public organization, so a coach whose session org is
  // another tenant must still be able to open the link a public page offers. Rule: read under the
  // viewer's organization first; if the player is not there and the viewer is a platform SUPER_ADMIN,
  // try the default public organization. A player from a tenant the viewer cannot see stays a 404 -
  // tenant separation is not relaxed, only the org the read is scoped to.
  const isPlatformAdmin = session.user.roles.includes("SUPER_ADMIN");
  let scope = session.user.organizationId;
  let passport = await withOrganizationContext(scope, (tx) => loadAthletePassport(tx, scope, playerId));
  if (!passport && isPlatformAdmin) {
    const publicOrganization = await resolveDefaultPublicOrganization();
    if (publicOrganization.id !== scope) {
      scope = publicOrganization.id;
      passport = await withOrganizationContext(scope, (tx) => loadAthletePassport(tx, scope, playerId));
    }
  }
  if (!passport) notFound();

  // Coach-private surfaces: training logs and adopted plans.
  const canSeePrivate = hasPermission(session.user.roles, "game:operate") || hasPermission(session.user.roles, "data:import");

  // Explicit publication (streak v4, Prompt 3): an unpublished passport is a 404 for everyone who is not
  // a coach or an operator. 404 rather than 403, so an unpublished athlete is indistinguishable from one
  // that does not exist - the same reasoning ADR-011 uses for coaching access.
  if (!passport.published && !canSeePrivate && !isPlatformAdmin) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs text-text-3">Athlete passport</p>
        <h1 className="mt-1 text-2xl font-bold text-text-1">
          {passport.jerseyNumber != null ? <span className="mr-2 text-text-3">#{passport.jerseyNumber}</span> : null}
          {passport.name}
        </h1>
        <p className="mt-1 text-sm text-text-2">
          {passport.position ?? "position not recorded"} Â· {passport.seasons.map((s) => `${s.clubName} (${s.seasonName})`).join(" Â· ")}
        </p>

        <section aria-labelledby="totals-heading" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 id="totals-heading" className="text-sm font-semibold">Career totals</h2>
          <p className="mt-1 text-xs text-text-3">
            {passport.totals.games} games
            {passport.provenance.length > 0 ? (
              <>
                {" "}
                Â· provenance:{" "}
                {passport.provenance.map((entry) => (
                  <span key={entry.source} className="mr-2 inline-flex items-center gap-1">
                    <Badge source={entry.source} />
                    <span>{entry.games}</span>
                  </span>
                ))}
              </>
            ) : null}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            {[
              ["PPG", passport.totals.pointsPerGame],
              ["RPG", passport.totals.reboundsPerGame],
              ["APG", passport.totals.assistsPerGame],
              ["PTS", passport.totals.points],
              ["MIN", passport.totals.minutes],
              ["GP", passport.totals.games],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded border border-line-subtle p-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-text-3">{label}</p>
                <p className="text-lg font-bold tabular-nums text-text-1">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Definition-driven stats per sport (streak v8, Prompt 3). A volleyball player has no PlayerStat
            rows - their kills/aces/blocks live in GameMetricValue - so before this the passport showed an
            empty basketball block and looked like the athlete had never played. */}
        {passport.sportStats.length > 0 ? (
          <section aria-labelledby="sport-stats-heading" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
            <h2 id="sport-stats-heading" className="text-sm font-semibold">By sport</h2>
            <p className="mt-1 text-xs text-text-3">
              Columns come from each sport&apos;s own metric definitions; nothing is mapped onto basketball&apos;s
              boxes.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {passport.sportStats.map((sport) => (
                <div key={sport.sportSlug} className="rounded border border-line p-3">
                  <p className="text-sm font-semibold text-text-1">
                    {sport.sportName} <span className="text-xs font-normal text-text-3">· {sport.games} game{sport.games === 1 ? "" : "s"}</span>
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {sport.metrics.map((metric) => (
                      <div key={metric.key} className="rounded border border-line-subtle p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-text-3">{metric.label}</p>
                        <p className="text-base font-bold tabular-nums text-text-1">{metric.value}</p>
                        <p className="text-[10px] text-text-3">{metric.perGame}/game</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="games-heading" className="mt-6">
          <h2 id="games-heading" className="text-sm font-semibold">
            Game log
          </h2>
          <p className="mt-1 text-xs text-text-3">
            Grouped by sport. Basketball games carry shooting columns; other sports show their metric rows above
            rather than fake zeroes here.
          </p>
          {passport.games.length === 0 ? (
            <p className="mt-2 text-sm text-text-2">No recorded games.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-text-3">
                    <th className="p-1">Date</th>
                    <th className="p-1">Opponent</th>
                    <th className="p-1 text-right">MIN</th>
                    <th className="p-1 text-right">PTS</th>
                    <th className="p-1 text-right">REB</th>
                    <th className="p-1 text-right">AST</th>
                    <th className="p-1 text-right">STL</th>
                    <th className="p-1 text-right">BLK</th>
                    <th className="p-1 text-right">TO</th>
                    <th className="p-1 text-right">PF</th>
                    <th className="p-1">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {passport.games.map((game, index) => (
                    <Fragment key={`${game.gameId}-${index}`}>
                      {/* Sport group header (streak v8, Prompt 3): a passport can span basketball and
                          volleyball, and a volleyball match rendered as a row of zeroes reads as "did not
                          play" rather than "different sport". */}
                      {index === 0 || passport.games[index - 1].sportSlug !== game.sportSlug ? (
                        <tr className="bg-white/[.03]">
                          <td colSpan={12} className="p-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">
                            {game.sportName}
                          </td>
                        </tr>
                      ) : null}
                    <tr key={`${game.gameId}`} className="border-t border-line-subtle">
                      <td className="p-1 text-text-2">{dateFormatter.format(game.playedAt)}</td>
                      <td className="p-1 text-text-1">
                        {game.isHome ? "vs" : "at"} {game.opponentName}
                      </td>
                      <td className="p-1 text-right tabular-nums">{game.minutes}</td>
                      <td className="p-1 text-right tabular-nums">{game.points}</td>
                      <td className="p-1 text-right tabular-nums">{game.rebounds}</td>
                      <td className="p-1 text-right tabular-nums">{game.assists}</td>
                      <td className="p-1 text-right tabular-nums">{game.steals}</td>
                      <td className="p-1 text-right tabular-nums">{game.blocks}</td>
                      <td className="p-1 text-right tabular-nums">{game.turnovers}</td>
                      <td className="p-1 text-right tabular-nums">{game.fouls}</td>
                      <td className="p-1">
                        <Badge source={game.provenance} />
                      </td>
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {canSeePrivate ? (
          <>
            <section aria-labelledby="training-heading" className="mt-6">
              <h2 id="training-heading" className="text-sm font-semibold">
                Training log <span className="text-xs font-normal text-text-3">(coach-private)</span>
              </h2>
              {passport.training.length === 0 ? (
                <p className="mt-2 text-sm text-text-2">No training sessions recorded for this player.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {passport.training.map((row) => (
                    <li key={row.sessionId} data-training={row.sessionId} className="rounded border border-line-subtle p-2 text-xs">
                      <p className="text-sm text-text-1">
                        {row.title} <span className="text-text-3">Â· {dateFormatter.format(row.occurredAt)}</span>{" "}
                        {row.completedAt ? <span className="text-success">Â· complete</span> : <span className="text-warn">Â· not complete</span>}
                      </p>
                      {row.focus ? <p className="mt-1 text-text-2">{row.focus}</p> : null}
                      {row.metrics.length > 0 ? (
                        <p className="mt-1 text-text-3">
                          <Badge source="MANUAL" />{" "}
                          {row.metrics.map((metric) => `${metric.name}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`).join(" Â· ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="plans-heading" className="mt-6">
              <h2 id="plans-heading" className="text-sm font-semibold">
                Adopted plans <span className="text-xs font-normal text-text-3">(coach-private)</span>
              </h2>
              {passport.plans.length === 0 ? (
                <p className="mt-2 text-sm text-text-2">No plan adopted yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {passport.plans.map((plan) => (
                    <li key={plan.id} className="rounded border border-line-subtle p-2 text-xs">
                      <p className="text-sm text-text-1">
                        {plan.status} Â· adopted {dateFormatter.format(plan.adoptedAt)} Â· {plan.sessions} session{plan.sessions === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-text-2">
                        {plan.focusAreas.map((area) => `${area.label} (target ${area.targetLabel})`).join(" Â· ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="mt-6 rounded-md border border-line bg-ink-700 p-3 text-xs text-text-2">
            Training logs and coaching plans are visible to coaches and league operators only.
          </p>
        )}

        <section aria-labelledby="legend-heading" className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 id="legend-heading" className="text-sm font-semibold">
            Provenance legend
          </h2>
          <p className="mt-1 text-xs text-text-3">
            Hover any badge above for the same explanation. The badge is derived from how the data was captured; it is not
            a quality score.
          </p>
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {(Object.keys(BADGE_EXPLANATION) as Provenance[]).map((source) => (
              <div key={source} className="flex items-start gap-2">
                <dt className="shrink-0 pt-0.5">
                  <Badge source={source} />
                </dt>
                <dd className="text-text-2">{BADGE_EXPLANATION[source]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="mt-2 text-xs">
          <Link href="/" className="text-info underline">
            Back
          </Link>
        </p>
      </main>
    </OperationsShell>
  );
}
