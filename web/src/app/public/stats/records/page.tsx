import Link from "next/link";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords, type RecordEntry } from "@/lib/analytics/records";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecordBook() {
  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-black">Season Zero Record Book</h1>
        <p className="mt-4 text-text-2">No active season right now.</p>
      </main>
    );
  }

  const [games, players] = await withOrganizationContext(organization.id, (tx) =>
    Promise.all([
      loadSeasonGameCores(season.id, tx),
      loadSeasonPlayerTotals(season.id, tx),
    ]),
  );

  if (games.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-black">Season Zero Record Book</h1>
        <p className="mt-4 text-text-2">No completed games yet.</p>
      </main>
    );
  }

  const playerSingleGame = buildPlayerSingleGameRecords(games);
  const playerSeason = buildPlayerSeasonRecords(players);
  const teamRecords = buildTeamRecords(games);
  const gameRecords = buildGameRecords(games);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[.3em] text-info">{season.name}</p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">Season Zero Record Book</h1>
      <p className="mt-2 text-sm text-text-3">Every record below is a direct calculation from the official box scores — official box score data, not reconstructed.</p>

      <RecordSection title="Player Single-Game Records" entries={playerSingleGame} />
      <RecordSection title="Player Season Records" entries={playerSeason} />
      <RecordSection title="Team Records" entries={teamRecords} />
      <RecordSection title="Game Records" entries={gameRecords} />
    </main>
  );
}

function RecordSection({ title, entries }: { title: string; entries: RecordEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {entries.map((r) => <RecordCard key={r.key} entry={r} />)}
      </div>
    </section>
  );
}

function RecordCard({ entry }: { entry: RecordEntry }) {
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-[.15em] text-info">{entry.title}</p>
      <p className="mt-1 text-2xl font-black">{entry.value}</p>
      <p className="mt-1 text-sm text-text-1">{entry.holderName}{entry.holderClubShortName ? ` · ${entry.holderClubShortName}` : ""}</p>
      <p className="text-xs text-text-3">{entry.context}</p>
    </>
  );
  return (
    <div className="rounded-lg border border-line bg-ink-800 p-4">
      {entry.fixtureId ? (
        <Link href={`/public/fixtures/${entry.fixtureId}`} className="block transition hover:opacity-80">{content}</Link>
      ) : content}
      <Link href={`/public/share/record/${encodeURIComponent(entry.key)}`} className="mt-2 inline-block text-[10px] font-bold uppercase tracking-wide text-info hover:underline">
        Shareable Card
      </Link>
    </div>
  );
}
