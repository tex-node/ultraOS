import { notFound } from "next/navigation";
import { coachedSeasonClubIds, canViewCoaching } from "@/lib/coaching/access";
import { developmentConfig } from "@/lib/coaching/config";
import { buildGamePlan } from "@/lib/coaching/game-plan";
import { buildSelectionAdvice } from "@/lib/coaching/selection";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub, requireCoachingViewer } from "@/server/coaching/guard";
import { loadSelectionFixture } from "@/server/coaching/selection-fixture";
import { SelectionView } from "../../_components/selection-view";

export const dynamic = "force-dynamic";

// /coaching/selection/[fixtureId] - the Selection / Rotation Advisor for one fixture.
//
// Guarding, in order (each step 404s rather than redirects, per ADR-011):
//   1. requireCoachingViewer() - flag on, signed in, a viewer with at least one coaching route.
//   2. the fixture must exist in an ACTIVE organization, and the viewer must be able to view at
//      least one of its two clubs.
//   3. requireCoachingClub(chosen) - the same guard every other coaching page uses, re-checked for
//      the club whose squad this page is about.
//
// Which side is "ours"? A fixture has two clubs and both may be coachable. The viewer's own coached
// club wins; an admin (who can see both) gets the home side, and `?side=away` switches. Anything else
// is a 404 - not an empty page.
export default async function CoachingSelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { fixtureId } = await params;
  const { side } = await searchParams;

  const viewer = await requireCoachingViewer();
  const fixture = await loadSelectionFixture(fixtureId);
  if (!fixture) notFound();

  const sides = [fixture.homeSeasonClubId, fixture.awaySeasonClubId];
  const accessible = sides.filter((seasonClubId) =>
    canViewCoaching(viewer, { organizationId: fixture.organizationId, seasonClubId }),
  );
  if (accessible.length === 0) notFound();

  const coached = coachedSeasonClubIds(viewer, fixture.organizationId).filter((id) => accessible.includes(id));
  const requested = side === "away" ? fixture.awaySeasonClubId : side === "home" ? fixture.homeSeasonClubId : null;
  const chosen = requested && accessible.includes(requested) ? requested : (coached[0] ?? accessible[0]);

  // Re-check through the canonical guard: this is the club whose squad the page will expose.
  const { scope } = await requireCoachingClub(chosen);

  const isHome = chosen === fixture.homeSeasonClubId;
  const opponentSeasonClubId = isHome ? fixture.awaySeasonClubId : fixture.homeSeasonClubId;
  const opponentName = isHome ? fixture.awayName : fixture.homeName;

  const data = await loadClubCoachingData(scope);
  const plan = buildGamePlan(data.games, chosen, opponentSeasonClubId, data.meta);
  const advice = buildSelectionAdvice({
    games: data.games,
    squad: data.roster.map((p) => ({ playerId: p.playerId, name: p.name, jerseyNumber: p.jerseyNumber, position: p.position, heightCm: p.heightCm })),
    plan,
    starterCount: 5,
  });

  return (
    <>
      {accessible.length === 2 ? (
        <p className="mb-2 text-xs text-text-3 print:hidden">
          Viewing{" "}
          <a href={`/coaching/selection/${fixtureId}`} className="text-info underline">
            {fixture.homeName}
          </a>{" "}
          ·{" "}
          <a href={`/coaching/selection/${fixtureId}?side=away`} className="text-info underline">
            {fixture.awayName}
          </a>
        </p>
      ) : null}
      <SelectionView
        seasonClubId={chosen}
        seasonClubName={scope.clubName}
        opponentSeasonClubId={opponentSeasonClubId}
        opponentName={opponentName}
        fixture={{ scheduledAt: fixture.scheduledAt, isHome, status: fixture.status }}
        advice={advice}
        minGames={developmentConfig.minGames}
        opponentSetupHref={`/coaching/${opponentSeasonClubId}/squad/setup`}
      />
    </>
  );
}
