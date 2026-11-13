import { withOrganizationContext } from "../src/lib/tenant-context";
import { assignPlanToSession, completeTrainingSession } from "../src/server/coaching/training";

// Prompt 3 evidence: create a SECOND session for the staging plan and complete it WITHOUT a metric, so
// the player page has to render "Missing data" for it (proving the null path against real data, not
// only in the component test).
const ORG = process.argv[2];
const SEASON_CLUB = process.argv[3];
const USER = process.argv[4];

async function main() {
  await withOrganizationContext(ORG, async (tx) => {
    const plan = await tx.coachingPlan.findFirst({
      where: { organizationId: ORG, seasonClubId: SEASON_CLUB, status: "ACTIVE" },
      select: { id: true, playerId: true },
    });
    if (!plan) {
      console.log("NO_ACTIVE_PLAN");
      return;
    }
    const assigned = await assignPlanToSession(tx, {
      organizationId: ORG,
      userId: USER,
      planId: plan.id,
      title: "Prompt 3 verification - completed with no metric",
      occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      durationMinutes: 40,
      sessionType: "SKILLS",
    });
    console.log(`assign: ${JSON.stringify(assigned)}`);
    if (!assigned.ok) return;
    const done = await completeTrainingSession(tx, { organizationId: ORG, userId: USER, sessionId: assigned.sessionId, note: "no metric logged on purpose" });
    console.log(`complete: ${JSON.stringify(done)}`);
    console.log(`SESSION_ID=${assigned.sessionId}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
