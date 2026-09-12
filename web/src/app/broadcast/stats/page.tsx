import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildLeaguePulse } from "@/lib/analytics/league-analytics";
import { buildPlayerLeaderboard, type LeaderboardEntry } from "@/lib/analytics/league-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { selectTopPerformers } from "@/lib/analytics/player-analytics";
import { buildSeasonStoryCards } from "@/lib/analytics/season-story-cards";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords, type RecordEntry } from "@/lib/analytics/records";
import { buildPlayerMilestones, buildTeamMilestones } from "@/lib/analytics/milestones";
import { buildPlayerLeaderFacts, buildRecordFacts, buildTeamLeaderFacts, type CommentatorFact } from "@/lib/analytics/commentator-facts";
import { computePlayerRanks, computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { computeLeagueTeamDna, type TeamDna } from "@/lib/analytics/team-dna";
import { teamStatisticalIdentity } from "@/lib/analytics/team-statistical-identity";
import type { SeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import type { GameCore } from "@/lib/analytics/types";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { CommentatorCommandCenter } from "../commentator-command-center";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BroadcastStats() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/broadcast/stats");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const season = await withOrganizationContext(organizationId, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-6xl px-6 py-10"><p>No active season.</p></main>
      </OperationsShell>
    );
  }

  const { games, playerTotals, seasonClubs, liveFixtures, liveModels } = await withOrganizationContext(organizationId, async (tx) => {
    const [games, playerTotals, seasonClubs] = await Promise.all([
      loadSeasonGameCores(season.id, tx),
      loadSeasonPlayerTotals(season.id, tx),
      tx.seasonClub.findMany({ where: { seasonId: season.id }, select: { id: true, clubId: true } }),
    ]);

    // G.18: any currently live/paused game(s), rendered as a Commentator Command Center at the
    // top of the page - reuses buildLivePresentationModelForGame(), the exact same composition
    // the public Game Center calls, so the commentator never sees a different version of the game.
    const liveFixtures = await tx.fixture.findMany({
      // G.19 Part III: this query had no isolation from a REHEARSAL (or any non-PRODUCTION)
      // fixture at all - the exact gap the G.18 rehearsal disclosed for `/live`, present here too.
      where: { seasonId: season.id, game: { status: { in: ["LIVE", "PAUSED"] } }, ...productionPresentationFixtureWhere() },
      include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
    });
    const liveModels = await Promise.all(liveFixtures.map((f) => buildLivePresentationModelForGame(f.game!.id, tx)));
    return { games, playerTotals, seasonClubs, liveFixtures, liveModels };
  });
  const clubIdBySeasonClubId = new Map(seasonClubs.map((sc) => [sc.id, sc.clubId]));
  const teamTotalsByClub = computeSeasonTeamTotals(games);
  const teamTotals = [...teamTotalsByClub.values()];
  const dnaByTeam = computeLeagueTeamDna(games);

  const pulse = buildLeaguePulse(games);
  const topScorers = buildPlayerLeaderboard(playerTotals, "PPG").slice(0, 5);
  const topRebounders = buildPlayerLeaderboard(playerTotals, "RPG").slice(0, 5);
  const topPlaymakers = buildPlayerLeaderboard(playerTotals, "APG").slice(0, 5);

  const gameStars = games
    .filter((g) => g.status === "FINAL")
    .map((g) => ({ game: g, star: selectTopPerformers(g).find((p) => p.category === "GAME_STAR") }))
    .filter((x): x is { game: typeof games[number]; star: NonNullable<ReturnType<typeof selectTopPerformers>[number]> } => x.star != null)
    .slice(0, 5);

  const teamLeaderBoards = teamTotals.map((t) => ({ team: t, ranks: topRankBadges(computeTeamRanks(t.seasonClubId, teamTotals), 1) })).filter((x) => x.ranks.length > 0);

  const records: RecordEntry[] = [
    ...buildPlayerSingleGameRecords(games),
    ...buildPlayerSeasonRecords(playerTotals),
    ...buildTeamRecords(games),
    ...buildGameRecords(games),
  ];

  const playerMilestones = buildPlayerMilestones(games).slice(-8).reverse();
  const teamMilestones = buildTeamMilestones(games).slice(-8).reverse();
  const seasonStories = buildSeasonStoryCards(games);

  const quickFacts: CommentatorFact[] = [
    ...buildPlayerLeaderFacts(playerTotals).slice(0, 5),
    ...buildTeamLeaderFacts(teamTotals, clubIdBySeasonClubId).slice(0, 5),
    ...buildRecordFacts(records).slice(0, 5),
  ];

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-cyan-400">{season.name} · Commentator Intelligence</p>
            <h1 className="mt-2 text-3xl font-bold">Broadcast Stats</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Every fact here is a direct calculation from the official box scores — nothing is estimated, and no 4PT/Ultra Time data is shown for Season Zero (not captured).
            </p>
          </div>
          <Link href="/broadcast/graphics" className="shrink-0 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
            Open Graphics Gallery
          </Link>
        </div>

        {liveFixtures.map((fixture, i) => (
          <CommentatorCommandCenter key={fixture.id} fixture={fixture} model={liveModels[i]} />
        ))}

        <Section title="Season Zero Snapshot">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pulse.map((c) => (
              <div key={c.key} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">{c.label}</p>
                <p className="mt-1 text-lg font-black">{c.value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Commentator Quick Facts">
          <div className="space-y-2">
            {quickFacts.map((f, i) => (
              <details key={i} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                <summary className="cursor-pointer text-sm text-zinc-200">{f.text}</summary>
                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  <p><span className="text-zinc-600">Source:</span> {f.calculation}</p>
                  <p><span className="text-zinc-600">Qualification:</span> {f.provenance}</p>
                  <Link href={f.sourceRoute} className="text-cyan-400 hover:underline">View source page</Link>
                </div>
              </details>
            ))}
          </div>
        </Section>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <LeaderboardSection title="Top Scorers" entries={topScorers} unit="PPG" />
          <LeaderboardSection title="Top Rebounders" entries={topRebounders} unit="RPG" />
          <LeaderboardSection title="Top Playmakers" entries={topPlaymakers} unit="APG" />
        </div>

        <Section title="Game Stars">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {gameStars.map(({ game, star }) => (
              <div key={game.fixtureId} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                <p className="text-sm font-bold">{star.player.name} <span className="text-zinc-500">· {star.player.seasonClubShortName}</span></p>
                <p className="text-xs text-zinc-500">{game.home.shortName} vs {game.away.shortName} · {star.player.points} PTS · {star.player.rebounds} REB · {star.player.assists} AST</p>
                <div className="mt-2 flex gap-2">
                  <Link href={`/public/fixtures/${game.fixtureId}`} className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">Full Story</Link>
                  <Link href={`/broadcast/graphics/preview?subject=game&id=${game.fixtureId}&card=star`} className="text-[10px] font-bold uppercase tracking-wide text-cyan-400 hover:underline">Open Game Card</Link>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Team Leaders">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {teamLeaderBoards.map(({ team, ranks }) => (
              <div key={team.seasonClubId} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                <p className="text-sm font-bold">{team.name}</p>
                {ranks.map((r) => <p key={r.metricId} className="text-xs text-cyan-300">#1 {r.shortLabel} · {r.value}</p>)}
                <Link href={`/broadcast/graphics/preview?subject=team&id=${team.seasonClubId}&card=profile`} className="mt-2 inline-block text-[10px] font-bold uppercase tracking-wide text-cyan-400 hover:underline">Open Team Card</Link>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Records">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {records.slice(0, 10).map((r) => (
              <div key={r.key} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">{r.title}</p>
                <p className="text-sm font-bold">{r.value} — {r.holderName}</p>
                <Link href={`/broadcast/graphics/preview?subject=record&key=${encodeURIComponent(r.key)}&card=record`} className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-cyan-400 hover:underline">Open Record Card</Link>
              </div>
            ))}
          </div>
          <Link href="/public/stats/records" className="mt-2 inline-block text-xs text-cyan-400 hover:underline">Full Record Book</Link>
        </Section>

        <Section title="Commentator Story Packs">
          <p className="mb-3 text-xs text-zinc-600">Pre-game context from real season data only — no predictions, no fabricated head-to-head history.</p>
          <div className="grid grid-cols-1 gap-3">
            {games.filter((g) => g.status === "FINAL").slice(0, 6).map((g) => (
              <StoryPack key={g.fixtureId} game={g} teamTotalsByClub={teamTotalsByClub} dnaByTeam={dnaByTeam} playerTotals={playerTotals} />
            ))}
          </div>
        </Section>

        <Section title="Milestones">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[...playerMilestones.map((m) => `${m.playerName} — ${m.label} (${m.value}) vs ${m.opponentShortName}`),
              ...teamMilestones.map((m) => `${m.teamName} — ${m.label} (${m.value}) vs ${m.opponentShortName}`)]
              .slice(0, 10)
              .map((text, i) => (
                <p key={i} className="rounded-lg border border-white/[.08] bg-[#0b100e] p-2.5 text-xs text-zinc-300">{text}</p>
              ))}
          </div>
        </Section>

        <Section title="Season Stories">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {seasonStories.map((c) => (
              <Link key={c.key} href={`/public/fixtures/${c.fixtureId}`} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3 transition hover:border-cyan-400/40">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">{c.title}</p>
                <p className="text-sm font-bold">{c.value}</p>
                <p className="text-xs text-zinc-500">{c.detail}</p>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Player &amp; Team Comparison">
          <p className="text-sm text-zinc-400">
            Use the existing verified comparison tools — this dashboard doesn&apos;t duplicate that calculation:
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/public/stats/compare/players" className="rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] px-3 py-1.5 text-xs font-bold text-cyan-300">Compare Players</Link>
            <Link href="/public/stats/compare/teams" className="rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] px-3 py-1.5 text-xs font-bold text-cyan-300">Compare Teams</Link>
            <Link href="/broadcast/graphics?tab=matchups" className="rounded-lg border border-white/[.15] px-3 py-1.5 text-xs font-bold text-zinc-300">Open Matchup Card</Link>
          </div>
        </Section>
      </main>
    </OperationsShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold uppercase tracking-wide text-cyan-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TeamStorySummary({
  team,
  dna,
  playerTotals,
}: {
  team: SeasonTeamTotals;
  dna: TeamDna | undefined;
  playerTotals: Awaited<ReturnType<typeof loadSeasonPlayerTotals>>;
}) {
  const ppg = team.gamesPlayed > 0 ? (team.pointsFor / team.gamesPlayed).toFixed(1) : "—";
  const oppPpg = team.gamesPlayed > 0 ? (team.pointsAgainst / team.gamesPlayed).toFixed(1) : "—";
  const identity = dna ? teamStatisticalIdentity(dna) : null;
  const rebounding = dna?.dimensions.find((d) => d.key === "REBOUNDING")?.teamValue;
  const bench = dna?.dimensions.find((d) => d.key === "BENCH_PRODUCTION")?.teamValue;
  const paint = dna?.dimensions.find((d) => d.key === "PAINT_ATTACK")?.teamValue;
  const teamPlayers = playerTotals.filter((p) => p.seasonClubShortName === team.shortName && p.gamesPlayed > 0);
  const keyPlayer = [...teamPlayers].sort((a, b) => b.points - a.points)[0];
  const keyPlayerRank = keyPlayer ? computePlayerRanks(keyPlayer.playerId, playerTotals).find((r) => r.metricId === "PPG") : null;

  return (
    <div className="flex-1 rounded-lg border border-white/[.08] bg-black/20 p-3">
      <p className="text-sm font-bold">{team.name}</p>
      <p className="text-xs text-zinc-500">{team.wins}-{team.losses} · {ppg} PPG · {oppPpg} Opp PPG</p>
      {identity ? <p className="mt-1 text-xs text-zinc-400">{identity}</p> : null}
      <p className="mt-1 text-[10px] text-zinc-600">
        {rebounding ? `REB ${rebounding}` : null}{bench ? ` · Bench ${bench}` : null}{paint ? ` · Paint ${paint}` : null}
      </p>
      {keyPlayer ? (
        <p className="mt-2 text-xs text-cyan-300">
          Key player: {keyPlayer.name}
          {keyPlayerRank ? ` — #${keyPlayerRank.rank} PPG (${keyPlayerRank.value})` : ""}
        </p>
      ) : null}
    </div>
  );
}

function StoryPack({
  game,
  teamTotalsByClub,
  dnaByTeam,
  playerTotals,
}: {
  game: GameCore;
  teamTotalsByClub: Map<string, SeasonTeamTotals>;
  dnaByTeam: ReturnType<typeof computeLeagueTeamDna>;
  playerTotals: Awaited<ReturnType<typeof loadSeasonPlayerTotals>>;
}) {
  const home = teamTotalsByClub.get(game.home.seasonClubId);
  const away = teamTotalsByClub.get(game.away.seasonClubId);
  if (!home || !away) return null;
  return (
    <div className="rounded-xl border border-white/[.08] bg-[#0b100e] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{game.home.shortName} vs {game.away.shortName} · Final {game.home.score}-{game.away.score}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <TeamStorySummary team={home} dna={dnaByTeam.get(game.home.seasonClubId)} playerTotals={playerTotals} />
        <TeamStorySummary team={away} dna={dnaByTeam.get(game.away.seasonClubId)} playerTotals={playerTotals} />
      </div>
      <Link href={`/public/fixtures/${game.fixtureId}`} className="mt-2 inline-block text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">Full Game Story</Link>
    </div>
  );
}

function LeaderboardSection({ title, entries, unit }: { title: string; entries: LeaderboardEntry[]; unit: string }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="mt-2 space-y-1.5">
        {entries.map((e, i) => (
          <div key={e.playerId} className="flex items-center justify-between rounded-lg border border-white/[.08] bg-[#0b100e] px-3 py-2 text-sm">
            <span className="text-zinc-300">#{i + 1} {e.name} <span className="text-zinc-600">· {e.seasonClubShortName}</span></span>
            <span className="font-bold text-cyan-300">{e.value} {unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
