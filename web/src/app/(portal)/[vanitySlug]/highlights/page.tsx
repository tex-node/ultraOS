import { notFound } from "next/navigation";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords, type RecordEntry } from "@/lib/analytics/records";
import { resolveVanityCompetitionId } from "@/lib/vanity-tournament";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Vanity tournament highlights - the short-URL sibling of /public/stats/records for any other
// organization's tournament. Reuses the exact same record-book engine (src/lib/analytics/
// records.ts) Neon Ultra's own record book runs on; every entry here is a direct calculation
// over the organization's own FINAL, competitively-scoped games (see competitive-scope.ts),
// nothing estimated. Public fixture-detail links are omitted (unlike /public/stats/records,
// which links into Neon-Ultra-only /public/fixtures/[id]) since this route stays a
// self-contained summary for a second organization's tournament, same as the Fixtures tab.
export default async function VanityTournamentHighlights({ params }: { params: Promise<{ vanitySlug: string }> }) {
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
      const [games, players] = await withOrganizationContext(resolved.organizationId, (tx) =>
        Promise.all([loadSeasonGameCores(season.id, tx), loadSeasonPlayerTotals(season.id, tx)]),
      );
      return {
        id: season.id,
        name: season.name,
        gameCount: games.length,
        playerSingleGame: buildPlayerSingleGameRecords(games),
        playerSeason: buildPlayerSeasonRecords(players),
        team: buildTeamRecords(games),
        game: buildGameRecords(games),
      };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {seasons.length === 0 ? <p className="text-sm text-text-3">Highlights appear here once games are played.</p> : null}
      {seasons.map((season) => (
        <section key={season.id} className="mb-12">
          <h2 className="text-2xl font-bold">{season.name}</h2>
          {season.gameCount === 0 ? (
            <p className="mt-4 text-sm text-text-3">No completed games yet.</p>
          ) : (
            <>
              <RecordSection title="Game Highlights" entries={season.game} />
              <RecordSection title="Team Records" entries={season.team} />
              <RecordSection title="Player Single-Game Records" entries={season.playerSingleGame} />
              <RecordSection title="Player Season Records" entries={season.playerSeason} />
            </>
          )}
        </section>
      ))}
    </main>
  );
}

function RecordSection({ title, entries }: { title: string; entries: RecordEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-text-1">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.key} className="rounded-lg border border-line bg-ink-800 p-4">
            <p className="text-[10px] uppercase tracking-[.15em] text-info">{entry.title}</p>
            <p className="mt-1 text-2xl font-black">{entry.value}</p>
            <p className="mt-1 text-sm text-text-1">
              {entry.holderName}
              {entry.holderClubShortName ? ` · ${entry.holderClubShortName}` : ""}
            </p>
            <p className="text-xs text-text-3">{entry.context}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
