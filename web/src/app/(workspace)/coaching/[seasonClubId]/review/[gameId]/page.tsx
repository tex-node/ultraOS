import { notFound } from "next/navigation";
import { buildGamePlan, buildGamePlanReview } from "@/lib/coaching/game-plan";
import { loadClubCoachingData } from "@/server/coaching/data";
import { requireCoachingClub } from "@/server/coaching/guard";
import { ReviewView } from "../../../_components/review-view";

export const dynamic = "force-dynamic";

// Post-game review for a finished game between this club and an opponent. The plan is rebuilt from
// games played BEFORE this one only, so the review never benefits from hindsight.
export default async function CoachingReviewPage({ params }: { params: Promise<{ seasonClubId: string; gameId: string }> }) {
  const { seasonClubId, gameId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);
  const data = await loadClubCoachingData(scope);

  const game = data.games.find((g) => g.gameId === gameId);
  if (!game || (game.home.seasonClubId !== seasonClubId && game.away.seasonClubId !== seasonClubId)) notFound();

  const home = game.home.seasonClubId === seasonClubId;
  const opponent = home ? game.away : game.home;
  const prior = data.games.filter((g) => g.scheduledAt.getTime() < game.scheduledAt.getTime());
  const plan = buildGamePlan(prior, seasonClubId, opponent.seasonClubId, data.meta);

  let reviews: ReturnType<typeof buildGamePlanReview> = [];
  let unavailableReason: string | null = null;
  if (!plan) unavailableReason = "One of the two clubs had no finished games before this one, so no plan could have been made.";
  else if (plan.status === "INSUFFICIENT_DATA") unavailableReason = `Before this game: ${plan.insufficientReason}`;
  else reviews = buildGamePlanReview(plan, game);

  return (
    <ReviewView
      focusName={scope.clubName}
      opponentName={opponent.name}
      scheduledAt={game.scheduledAt}
      focusScore={home ? game.home.score : game.away.score}
      opponentScore={home ? game.away.score : game.home.score}
      reviews={reviews}
      unavailableReason={unavailableReason}
    />
  );
}
