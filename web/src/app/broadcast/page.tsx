import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { classifyGameStory } from "@/lib/analytics/game-story";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TOOLS = [
  {
    href: "/broadcast/stats",
    title: "Commentator Dashboard",
    description: "League Pulse, leaderboards, records, milestones, and auto-generated Story Packs for recent games.",
  },
  {
    href: "/broadcast/graphics",
    title: "Graphics Gallery",
    description: "Browse every player, team, game, leader, record, and milestone card. Preview in Web/Square/Portrait/Broadcast formats and export PNGs.",
  },
  {
    href: "/broadcast/control",
    title: "Broadcast Control",
    description: "Preview and TAKE live browser-source graphics (score bug, Ultra Time, Player Spotlight, and more) for OBS/vMix.",
  },
  {
    href: "/broadcast/diagnostics",
    title: "Live System Diagnostics",
    description: "Is the live production system healthy right now? Database, snapshot freshness, reconciliation, presentation state, and every browser source in one screen.",
  },
  {
    href: "/public/stats",
    title: "Public Stats",
    description: "The public-facing stats hub — category leaders, records, and the full leaderboard, exactly as fans see it.",
  },
];

export default async function BroadcastHub() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/broadcast");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const season = await withOrganizationContext(organizationId, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-6xl px-6 py-10"><p className="text-zinc-400">No active season.</p></main>
      </OperationsShell>
    );
  }

  const games = await withOrganizationContext(organizationId, (tx) => loadSeasonGameCores(season.id, tx));
  const recentFinals = games
    .filter((g) => g.status === "FINAL")
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    .slice(0, 10);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Broadcast &amp; Media</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Everything for turning Season Zero stats into shareable game stories, broadcast graphics, and commentator material — all in one place.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 transition hover:border-emerald-400/40">
              <h2 className="font-semibold text-emerald-300">{tool.title}</h2>
              <p className="mt-2 text-xs text-zinc-500">{tool.description}</p>
            </Link>
          ))}
        </div>

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Shareable Game Stories</h2>
            <span className="text-xs text-zinc-500">{recentFinals.length} most recent finished games</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Every finished game gets a Game Story (narrative tags, Why They Won, Top Performers) automatically. Open the full story, the public share card, or export a PNG directly.
          </p>

          {recentFinals.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No finished games yet this season.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {recentFinals.map((game) => {
                const tags = classifyGameStory(game);
                const winner = game.home.score >= game.away.score ? game.home : game.away;
                const loser = winner === game.home ? game.away : game.home;
                return (
                  <div key={game.fixtureId} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {winner.shortName} {winner.score} <span className="text-zinc-500">def.</span> {loser.shortName} {loser.score}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {game.scheduledAt.toLocaleDateString()} · {game.divisionName}
                          {tags.length > 0 ? ` · ${tags.map((t) => t.replaceAll("_", " ")).join(" · ")}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Link href={`/public/fixtures/${game.fixtureId}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/30">Full Story</Link>
                        <Link href={`/public/share/game/${game.fixtureId}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/30">Share View</Link>
                        <Link href={`/broadcast/graphics/preview?subject=game&id=${game.fixtureId}&card=result`} className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-emerald-300 hover:border-emerald-400/60">Graphics</Link>
                        <a href={`/api/share/game/${game.fixtureId}?format=square`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/30">PNG</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
