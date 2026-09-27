import { notFound } from "next/navigation";
import { buildOpponentScoutingReports, type OpponentScoutingReport } from "@/lib/analytics/opponent-scouting";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { TEAM_DNA_TAG_LABEL } from "@/lib/analytics/team-dna";
import { hasInsightsAccess } from "@/lib/insights-access";
import { resolveVanityCompetitionId } from "@/lib/vanity-tournament";
import { withOrganizationContext } from "@/lib/tenant-context";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Private coaching scouting reports for one team's account, not a public page - gated to a
// single hardcoded email (src/lib/insights-access.ts), 404 for everyone else so the tab and
// the page are both invisible rather than merely blocked. Every number here comes straight out
// of the box scores already ingested for this competition; see
// src/lib/analytics/opponent-scouting.ts for how threats/weaknesses are derived.
const FOCUS_TEAM_NAME = "Ultra Basketball";

export default async function VanityTournamentInsights({ params }: { params: Promise<{ vanitySlug: string }> }) {
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!hasInsightsAccess(session?.user?.email)) notFound();

  const { vanitySlug } = await params;
  const resolved = await resolveVanityCompetitionId(vanitySlug);
  if (!resolved) notFound();

  const competition = await withOrganizationContext(resolved.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id: resolved.competitionId },
      include: { seasons: { orderBy: { startDate: "desc" }, select: { id: true, name: true } } },
    }),
  );
  if (!competition) notFound();

  const seasons = await Promise.all(
    competition.seasons.map(async (season) => {
      const games = await withOrganizationContext(resolved.organizationId, (tx) => loadSeasonGameCores(season.id, tx));
      const focusTeamId = games
        .flatMap((g) => [g.home, g.away])
        .find((side) => side.name === FOCUS_TEAM_NAME)?.seasonClubId;
      const reports = focusTeamId ? buildOpponentScoutingReports(games, focusTeamId) : [];
      return { id: season.id, name: season.name, gameCount: games.length, focusTeamId, reports };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[.15em] text-info">Coaching Insights - private</p>
        <h2 className="mt-1 text-2xl font-bold">Opponent scouting reports for {FOCUS_TEAM_NAME}</h2>
        <p className="mt-2 max-w-3xl text-sm text-text-3">
          Every number below is computed directly from this competition&apos;s ingested box scores - top scorers,
          shooting splits, turnovers, and rebounding across each team&apos;s full body of games this season. Threats
          and weaknesses are flagged only when a team clears an explicit numeric threshold, never guessed.
        </p>
      </div>
      {seasons.map((season) => (
        <section key={season.id} className="mb-12">
          <h3 className="text-lg font-semibold text-text-1">{season.name}</h3>
          {season.gameCount === 0 ? (
            <p className="mt-4 text-sm text-text-3">No completed games yet.</p>
          ) : !season.focusTeamId ? (
            <p className="mt-4 text-sm text-text-3">{FOCUS_TEAM_NAME} hasn&apos;t been found in this season&apos;s games.</p>
          ) : season.reports.length === 0 ? (
            <p className="mt-4 text-sm text-text-3">No opponent data yet - other teams haven&apos;t played a game this season.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {season.reports.map((report) => (
                <OpponentCard key={report.seasonClubId} report={report} />
              ))}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

function OpponentCard({ report }: { report: OpponentScoutingReport }) {
  return (
    <div className="rounded-lg border border-line bg-ink-800 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-lg font-bold text-text-1">{report.name}</h4>
        <span className="text-sm text-text-3">
          {report.wins}-{report.losses} · {report.pointsForPerGame} PPG · {report.pointsAgainstPerGame} PA/G
        </span>
      </div>
      {report.headToHead.gamesPlayed > 0 ? (
        <p className="mt-1 text-xs text-info">
          Head-to-head this season: {report.headToHead.focusWins}-{report.headToHead.focusLosses}
        </p>
      ) : (
        <p className="mt-1 text-xs text-text-3">Not played yet this season.</p>
      )}

      <p className="mt-3 text-sm text-text-1">{report.gamePlan}</p>

      {report.dnaTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {report.dnaTags.map((tag) => (
            <span key={tag} className="rounded-full border border-line bg-white/[.04] px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-text-2">
              {TEAM_DNA_TAG_LABEL[tag]}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[.15em] text-text-3">Players to watch</p>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-text-3">
                <th className="pb-1 font-normal">Player</th>
                <th className="pb-1 font-normal">PPG</th>
                <th className="pb-1 font-normal">FG%</th>
                <th className="pb-1 font-normal">3P%</th>
              </tr>
            </thead>
            <tbody>
              {report.topScorers.map((p) => (
                <tr key={p.playerId} className="border-t border-line/60">
                  <td className="py-1 text-text-1">
                    {p.name}
                    {p.jerseyNumber != null ? <span className="text-text-3"> #{p.jerseyNumber}</span> : null}
                  </td>
                  <td className="py-1 text-text-1">{p.ppg}</td>
                  <td className="py-1 text-text-1">{p.fgPct != null ? `${p.fgPct.toFixed(1)}%` : "—"}</td>
                  <td className="py-1 text-text-1">{p.threePct != null ? `${p.threePct.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3">
          {report.threats.length > 0 ? (
            <NoteList title="Key threats" tone="warn" notes={report.threats} />
          ) : null}
          {report.weaknesses.length > 0 ? (
            <NoteList title="Exploitable weaknesses" tone="good" notes={report.weaknesses} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NoteList({ title, tone, notes }: { title: string; tone: "warn" | "good"; notes: { label: string; detail: string }[] }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-[.15em] ${tone === "warn" ? "text-warn" : "text-success"}`}>{title}</p>
      <ul className="mt-2 space-y-2">
        {notes.map((note) => (
          <li key={note.label} className="text-xs">
            <span className="font-semibold text-text-1">{note.label}.</span>{" "}
            <span className="text-text-3">{note.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
