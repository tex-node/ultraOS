import Link from "next/link";
import { buildGamePlan } from "@/lib/coaching/game-plan";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { Card, formatDate, Num, SectionTitle } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function CoachingOpponentsPage({ params }: { params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);
  const base = `/coaching/${seasonClubId}`;

  const rows = data.clubs
    .filter((c) => c.seasonClubId !== seasonClubId)
    .map((c) => {
      const plan = buildGamePlan(data.games, seasonClubId, c.seasonClubId, data.meta);
      const h2h = data.games
        .filter((g) => (g.home.seasonClubId === seasonClubId && g.away.seasonClubId === c.seasonClubId) || (g.away.seasonClubId === seasonClubId && g.home.seasonClubId === c.seasonClubId))
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      return { club: c, plan, h2h };
    })
    .sort((a, b) => a.club.name.localeCompare(b.club.name));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Opponents</h1>
      <p className="mt-1 text-sm text-text-2">A game plan for any club in {scope.seasonName}.</p>
      <SectionTitle>All clubs</SectionTitle>
      <ul className="space-y-3">
        {rows.map(({ club, plan, h2h }) => {
          const ready = plan?.status === "OK";
          return (
            <li key={club.seasonClubId} data-opponent={club.seasonClubId}>
              <Card quiet={!ready}>
                <Link href={`${base}/opponents/${club.seasonClubId}`} className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-text-1">{club.name}</span>
                  <span className="text-xs text-text-3">{ready ? "Plan ready" : "Not enough games yet"}</span>
                </Link>
                <p className="mt-1 text-xs text-text-3">
                  Head-to-head <Num>{h2h.filter((g) => (g.home.seasonClubId === seasonClubId ? g.home.score > g.away.score : g.away.score > g.home.score)).length}-{h2h.filter((g) => (g.home.seasonClubId === seasonClubId ? g.home.score < g.away.score : g.away.score < g.home.score)).length}</Num>
                </p>
                {h2h.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {h2h.map((g) => (
                      <li key={g.gameId} className="flex items-center justify-between gap-2 text-xs text-text-2">
                        <span>{formatDate(g.scheduledAt)} · <Num>{g.home.seasonClubId === seasonClubId ? `${g.home.score}-${g.away.score}` : `${g.away.score}-${g.home.score}`}</Num></span>
                        <Link href={`${base}/review/${g.gameId}`} className="text-info">Post-game review</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
