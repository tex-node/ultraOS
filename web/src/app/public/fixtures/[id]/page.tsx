import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonAvatar } from "@/app/components/person-avatar";
import { loadGameCoreByFixture } from "@/lib/analytics/game-analytics";
import { classifyGameStory, buildGameStorySummary } from "@/lib/analytics/game-story";
import { GAME_STORY_LABEL, GAME_STORY_PRIORITY, PERFORMER_LABEL } from "@/lib/analytics/labels";
import { formatPercent, percent } from "@/lib/analytics/normalization";
import { effectiveEfficiency, playerBadgesForGame, playerScoringShare, selectTopPerformers } from "@/lib/analytics/player-analytics";
import { buildTeamComparison } from "@/lib/analytics/team-analytics";
import type { GameCore, PlayerLine, TopPerformer, WhyTheyWonFactor } from "@/lib/analytics/types";
import { rankWhyTheyWon } from "@/lib/analytics/why-they-won";
import { buildMatchupIntelligence, type MatchupFactor } from "@/lib/analytics/matchup-intelligence";
import { GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL, getGameAnalyticsCapability, hasEventLedger, hasUltraStatDerivation } from "@/lib/game-data-capability";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { buildWhyTheyWonCard } from "@/lib/analytics/cards/game-cards";
import { buildGameStarCard } from "@/lib/analytics/cards/player-cards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.FIXTURE,
    id,
  );
  if (!locator) notFound();
  const fixture = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.fixture.findUnique({
      where: { id: locator.resourceId },
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
        homeEntrant: true,
        awayEntrant: true,
        venue: true,
        division: true,
      },
    }),
  );
  if (!fixture || !locatorMatchesResource(locator, fixture)) notFound();
  const organizationId = locator.organizationId;
  // A fixture side is a SeasonClub (team sports) or an Entrant (individual sports).
  const sides = {
    home: fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "TBD",
    away: fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "TBD",
  };

  if (fixture.status !== "FINAL") {
    return <PreGameOrLive fixture={{ id: fixture.id, status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore, scheduledAt: fixture.scheduledAt, venue: fixture.venue, homeName: sides.home, awayName: sides.away }} organizationId={organizationId} />;
  }

  const game = await withOrganizationContext(organizationId, (tx) => loadGameCoreByFixture(id, tx));
  if (!game) return <PreGameOrLive fixture={{ id: fixture.id, status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore, scheduledAt: fixture.scheduledAt, venue: fixture.venue, homeName: sides.home, awayName: sides.away }} organizationId={organizationId} />;

  const storyTags = classifyGameStory(game);
  const headlineTag = GAME_STORY_PRIORITY.find((t) => storyTags.includes(t));
  const insights = buildGameStorySummary(game);
  const whyTheyWon = rankWhyTheyWon(game);
  const performers = selectTopPerformers(game);
  const badges = playerBadgesForGame(game);
  const comparison = buildTeamComparison(game);
  const winner = game.home.score >= game.away.score ? game.home : game.away;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <Hero game={game} headlineTag={headlineTag} scheduledAt={fixture.scheduledAt} venueName={fixture.venue.name} />

      {insights.length > 0 ? (
        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5 sm:p-6">
          <ul className="space-y-2 text-sm text-text-1 sm:text-base">
            {insights.map((insight, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-info">›</span>
                {insight.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {whyTheyWon.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">Why They Won</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {whyTheyWon.map((factor) => (
              <div key={factor.key} className="rounded-lg border border-info/20 bg-info/[.04] p-4">
                <p className="text-xs uppercase tracking-[.15em] text-info">{factor.label}</p>
                <p className="mt-2 text-lg font-black">
                  {factor.winnerValue} <span className="text-sm font-normal text-text-3">vs {factor.loserValue}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {performers.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">Top Performers</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {performers.map((p) => (
              <PerformerCard key={p.category} category={p.category} player={p.player} headline={p.headline} game={game} badges={badges.get(p.player.playerId) ?? []} />
            ))}
          </div>
        </section>
      ) : null}

      <BroadcastCardsSection game={game} performers={performers} whyTheyWon={whyTheyWon} winnerShortName={winner.shortName} />

      <MatchupIntelligenceSection game={game} />

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">Team Comparison</h2>
        <ComparisonTable game={game} rows={comparison} />
      </section>

      <GamePulse game={game} />

      <UltraImpact game={game} />

      <GameFlow game={game} />

      <BoxScore game={game} winnerSeasonClubId={winner.seasonClubId} />
    </main>
  );
}

async function PreGameOrLive({
  fixture,
  organizationId,
}: {
  organizationId: string;
  fixture: { id: string; status: string; homeScore: number; awayScore: number; scheduledAt: Date; venue: { name: string }; homeName: string; awayName: string };
}) {
  const game = await withOrganizationContext(organizationId, (tx) => tx.game.findUnique({ where: { fixtureId: fixture.id }, select: { id: true } }));
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="rounded-lg border border-line bg-ink-800 p-8 text-center">
        <p className="text-info">{fixture.status}</p>
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center">
          <MatchTeam name={fixture.homeName} score={fixture.homeScore} />
          <span className="text-text-3">VS</span>
          <MatchTeam name={fixture.awayName} score={fixture.awayScore} />
        </div>
        <p className="mt-8 text-text-2">
          {formatLagosDateTime(fixture.scheduledAt)} · {fixture.venue.name}
        </p>
        {game && fixture.status === "LIVE" ? (
          <Link href={`/scoreboard/${game.id}`} className="mt-5 inline-block text-info">
            Full-screen scoreboard
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function MatchTeam({ name, score }: { name: string; score: number }) {
  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">{name}</h1>
      <p className="mt-4 text-6xl font-black sm:text-7xl">{score}</p>
    </div>
  );
}

function TeamBadge({ shortName, logoUrl, primaryColor }: { shortName: string; logoUrl: string | null; primaryColor: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={shortName} src={logoUrl} className="h-14 w-14 rounded-md object-cover sm:h-20 sm:w-20" />;
  }
  const color = primaryColor ?? "#22d3ee";
  return (
    <div
      className="grid h-14 w-14 place-items-center rounded-md border text-lg font-black sm:h-20 sm:w-20 sm:text-2xl"
      style={{ borderColor: `${color}55`, background: `${color}15`, color }}
    >
      {shortName.slice(0, 3).toUpperCase()}
    </div>
  );
}

function Hero({ game, headlineTag, scheduledAt, venueName }: { game: GameCore; headlineTag: string | undefined; scheduledAt: Date; venueName: string }) {
  const isOvertime = game.periods.some((p) => /^OT/i.test(p.label));
  return (
    <section className="relative overflow-hidden rounded-lg border border-info/20 bg-gradient-to-b from-[#0a1418] to-[#050708] p-6 text-center sm:p-10">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <p className="relative text-xs font-bold uppercase tracking-[.3em] text-info">
        {isOvertime ? "Overtime" : "Final"} · {game.divisionName}
      </p>
      {headlineTag ? (
        <p className="relative mt-2 text-sm font-semibold uppercase tracking-[.2em] text-text-2">{GAME_STORY_LABEL[headlineTag as keyof typeof GAME_STORY_LABEL]}</p>
      ) : null}
      <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
        <div className="flex flex-col items-center gap-3">
          <TeamBadge shortName={game.home.shortName} logoUrl={game.home.logoUrl} primaryColor={game.home.primaryColor} />
          <p className="text-sm font-bold sm:text-base">{game.home.shortName}</p>
        </div>
        <div className="flex items-baseline gap-2 text-4xl font-black sm:text-6xl">
          <span className={game.home.score >= game.away.score ? "text-white" : "text-text-3"}>{game.home.score}</span>
          <span className="text-lg text-text-3 sm:text-2xl">–</span>
          <span className={game.away.score >= game.home.score ? "text-white" : "text-text-3"}>{game.away.score}</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <TeamBadge shortName={game.away.shortName} logoUrl={game.away.logoUrl} primaryColor={game.away.primaryColor} />
          <p className="text-sm font-bold sm:text-base">{game.away.shortName}</p>
        </div>
      </div>
      {game.periods.length > 0 ? (
        <div className="relative mt-6 flex justify-center gap-4 text-xs text-text-3 sm:text-sm">
          {game.periods.map((p) => (
            <span key={p.period}>
              {p.label} <b className="text-text-1">{p.homeScore}-{p.awayScore}</b>
            </span>
          ))}
        </div>
      ) : null}
      <p className="relative mt-4 text-xs text-text-3">
        {formatLagosDateTime(scheduledAt)} · {venueName}
      </p>
      <div className="relative mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-block rounded-full border border-line px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-text-3">
          {GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL[getGameAnalyticsCapability(game.dataCapability)]}
        </span>
        <Link href={`/public/share/game/${game.fixtureId}`} className="inline-block rounded-full border border-info/30 bg-info/[.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info">
          Shareable Card
        </Link>
      </div>
    </section>
  );
}

function BroadcastCardsSection({
  game,
  performers,
  whyTheyWon,
  winnerShortName,
}: {
  game: GameCore;
  performers: TopPerformer[];
  whyTheyWon: WhyTheyWonFactor[];
  winnerShortName: string;
}) {
  const gameStar = performers.find((p) => p.category === "GAME_STAR");
  const capability = getGameAnalyticsCapability(game.dataCapability);
  if (!gameStar && whyTheyWon.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Broadcast Cards</h2>
      <p className="mt-1 text-xs text-text-3">Ready-to-share graphics generated from this game&apos;s data — same numbers as above.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {gameStar ? (
          <AnalyticsCard
            card={buildGameStarCard(gameStar, gameStar.player.side === "HOME" ? game.away.shortName : game.home.shortName, capability)}
          />
        ) : null}
        {whyTheyWon.length > 0 ? (
          <AnalyticsCard card={buildWhyTheyWonCard(winnerShortName, whyTheyWon, capability)} />
        ) : null}
      </div>
      <Link href={`/public/share/game/${game.fixtureId}`} className="mt-3 inline-block text-xs font-bold uppercase tracking-wide text-info hover:underline">
        Open Full Share View
      </Link>
    </section>
  );
}

function PerformerCard({
  category,
  player,
  headline,
  game,
  badges,
}: {
  category: string;
  player: PlayerLine;
  headline: string;
  game: GameCore;
  badges: string[];
}) {
  const share = playerScoringShare(player, game);
  return (
    <article className="rounded-lg border border-line bg-ink-800 p-4">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-info">{PERFORMER_LABEL[category as keyof typeof PERFORMER_LABEL]}</p>
      <div className="mt-3 flex items-center gap-3">
        <PersonAvatar className="h-12 w-12" name={player.name} photoUrl={player.photoUrl} />
        <div>
          <p className="font-bold leading-tight">{player.name}</p>
          <p className="text-xs text-text-3">{player.seasonClubShortName}{player.jerseyNumber != null ? ` · #${player.jerseyNumber}` : ""}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-text-1">{headline}</p>
      {share != null && share >= 30 ? <p className="mt-1 text-xs text-text-3">{formatPercent(share, 1)} of team scoring</p> : null}
      {badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span key={b} className="rounded-full border border-info/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
              {b.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ComparisonBar({ label, home, away, homeIsBetter }: { label: string; home: string; away: string; homeIsBetter: boolean | null }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line py-2.5 text-sm">
      <span className={`text-right font-semibold ${homeIsBetter === true ? "text-info" : "text-text-1"}`}>{home}</span>
      <span className="text-center text-[10px] uppercase tracking-wide text-text-3">{label}</span>
      <span className={`font-semibold ${homeIsBetter === false ? "text-info" : "text-text-1"}`}>{away}</span>
    </div>
  );
}

function MatchupIntelligenceSection({ game }: { game: GameCore }) {
  const factors = buildMatchupIntelligence(game);
  if (factors.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Matchup Intelligence</h2>
      <p className="mt-1 text-xs text-text-3">Game profile — what happened in this box score, not a prediction.</p>
      <div className="mt-3 space-y-3 rounded-lg border border-line bg-ink-800 p-4 sm:p-5">
        {factors.slice(0, 6).map((f) => (
          <MatchupBar key={f.key} factor={f} game={game} />
        ))}
      </div>
    </section>
  );
}

function MatchupBar({ factor, game }: { factor: MatchupFactor; game: GameCore }) {
  const edgeLabel = factor.edge === "A" ? game.home.shortName : factor.edge === "B" ? game.away.shortName : "Even";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-text-1">{factor.label}</span>
        <span className="text-info">{edgeLabel}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-text-3">
        <span className="w-10 text-right">{factor.homeValue}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[.06]">
          <div className="h-full bg-cyan-400" style={{ width: `${Math.round(factor.homeShare * 100)}%` }} />
        </div>
        <span className="w-10">{factor.awayValue}</span>
      </div>
    </div>
  );
}

function ComparisonTable({ game, rows }: { game: GameCore; rows: ReturnType<typeof buildTeamComparison> }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-ink-800 p-4 sm:p-5">
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] text-xs font-bold text-text-3">
        <span className="text-right">{game.home.shortName}</span>
        <span />
        <span>{game.away.shortName}</span>
      </div>
      {rows.map((r) => (
        <ComparisonBar key={r.key} label={r.label} home={r.home} away={r.away} homeIsBetter={r.homeIsBetter} />
      ))}
    </div>
  );
}

function GamePulse({ game }: { game: GameCore }) {
  const { home } = game;
  if (home.leadChanges == null && home.timesTied == null && home.biggestLead == null) return null;
  const cards = [
    home.leadChanges != null ? { label: "Lead Changes", value: String(home.leadChanges) } : null,
    home.timesTied != null ? { label: "Times Tied", value: String(home.timesTied) } : null,
    game.home.biggestLead != null || game.away.biggestLead != null
      ? { label: "Biggest Lead", value: `${Math.max(game.home.biggestLead ?? 0, game.away.biggestLead ?? 0)}` }
      : null,
  ].filter((c): c is { label: string; value: string } => c != null);
  if (cards.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Game Pulse</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-line bg-ink-800 p-4 text-center">
            <p className="text-2xl font-black text-info sm:text-3xl">{c.value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[.15em] text-text-3">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UltraImpact({ game }: { game: GameCore }) {
  if (!hasUltraStatDerivation(game.dataCapability)) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">Ultra Impact</h2>
        <div className="mt-3 rounded-lg border border-dashed border-line bg-transparent p-5 text-center text-sm text-text-3">
          Ultra event data not captured for this game — 4PT and Ultra Time breakdowns require this app&apos;s live scorer, not a box-score import.
        </div>
      </section>
    );
  }
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Ultra Impact</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <UltraStat label="Ultra-Time Points" value={game.home.ultraTimePointsFor} />
        <UltraStat label="4PT Makes" value={game.home.fourPointsMade} />
        <UltraStat label="4PT Attempts" value={game.home.fourPointsAttempted} />
      </div>
    </section>
  );
}

function UltraStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-info/20 bg-info/[.04] p-4 text-center">
      <p className="text-2xl font-black text-info">{value ?? "—"}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[.15em] text-text-3">{label}</p>
    </div>
  );
}

function GameFlow({ game }: { game: GameCore }) {
  if (game.periods.length < 2) return null;
  const width = 600;
  const height = 160;
  const maxScore = Math.max(...game.periods.map((p) => Math.max(p.homeScore, p.awayScore)), 1);
  const stepX = width / (game.periods.length - 1 + 1);
  const points = (key: "homeScore" | "awayScore") =>
    [{ period: 0, [key]: 0 } as unknown as (typeof game.periods)[number], ...game.periods]
      .map((p, i) => `${i * stepX + stepX / 2},${height - (p[key] / maxScore) * (height - 20) - 10}`)
      .join(" ");

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Game Flow</h2>
      <p className="mt-1 text-xs text-text-3">Period score progression — resolution limited to half/OT checkpoints for this game.</p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-ink-800 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[500px]" role="img" aria-label="Score progression by period">
          <polyline points={points("homeScore")} fill="none" stroke={game.home.primaryColor ?? "#22d3ee"} strokeWidth="2.5" />
          <polyline points={points("awayScore")} fill="none" stroke={game.away.primaryColor ?? "#f472b6"} strokeWidth="2.5" strokeDasharray="4 3" />
        </svg>
        <div className="mt-2 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: game.home.primaryColor ?? "#22d3ee" }} />{game.home.shortName}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: game.away.primaryColor ?? "#f472b6" }} />{game.away.shortName}</span>
        </div>
      </div>
    </section>
  );
}

function BoxScore({ game, winnerSeasonClubId }: { game: GameCore; winnerSeasonClubId: string }) {
  const home = game.players.filter((p) => p.side === "HOME");
  const away = game.players.filter((p) => p.side === "AWAY");
  const showFourPt = hasUltraStatDerivation(game.dataCapability);
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Box Score</h2>
      {[{ side: game.home, players: home }, { side: game.away, players: away }].map(({ side, players }) => (
        <div key={side.seasonClubId} className="mt-3">
          <p className="text-sm font-bold" style={side.seasonClubId === winnerSeasonClubId ? { color: "#22d3ee" } : undefined}>
            {side.name}
          </p>
          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-line text-text-3">
                  <Th>Player</Th><Th>MIN</Th><Th>PTS</Th><Th>FG</Th><Th>FG%</Th><Th>3PT</Th>{showFourPt ? <Th>4PT</Th> : null}
                  <Th>FT</Th><Th>REB</Th><Th>AST</Th><Th>STL</Th><Th>BLK</Th><Th>TO</Th><Th>PF</Th><Th>EFF</Th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.playerId} className={`border-b border-white/[.04] ${p.didNotPlay ? "text-text-3" : ""}`}>
                    <td className="px-3 py-2 font-medium">{p.name}{p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ""}</td>
                    <td className="px-3 py-2">{p.didNotPlay ? "DNP" : p.minutesPlayed}</td>
                    <td className="px-3 py-2 font-bold">{p.points}</td>
                    <td className="px-3 py-2">{p.fieldGoalsMade ?? "—"}/{p.fieldGoalsAttempted ?? "—"}</td>
                    <td className="px-3 py-2">{formatPercent(percent(p.fieldGoalsMade, p.fieldGoalsAttempted))}</td>
                    <td className="px-3 py-2">{p.threePointsMade ?? "—"}/{p.threePointsAttempted ?? "—"}</td>
                    {showFourPt ? <td className="px-3 py-2">{p.fourPointsMade ?? "—"}/{p.fourPointsAttempted ?? "—"}</td> : null}
                    <td className="px-3 py-2">{p.freeThrowsMade ?? "—"}/{p.freeThrowsAttempted ?? "—"}</td>
                    <td className="px-3 py-2">{p.rebounds}</td>
                    <td className="px-3 py-2">{p.assists}</td>
                    <td className="px-3 py-2">{p.steals}</td>
                    <td className="px-3 py-2">{p.blocks}</td>
                    <td className="px-3 py-2">{p.turnovers}</td>
                    <td className="px-3 py-2">{p.fouls}</td>
                    <td className="px-3 py-2">{effectiveEfficiency(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!hasEventLedger(game.dataCapability) ? (
        <p className="mt-3 text-xs text-text-3">Play-by-play data not captured for this game — box score sourced from the official match report.</p>
      ) : null}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}
