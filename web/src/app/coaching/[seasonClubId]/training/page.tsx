import Link from "next/link";
import { requireCoachingClub } from "@/server/coaching/guard";
import { loadAssignablePlans, loadTrainingWeek } from "@/server/coaching/training";
import { withOrganizationContext } from "@/lib/tenant-context";
import { Card, Num, SectionTitle, formatDate } from "../../_components/ui";
import { assignSession } from "./actions";
import { AssignForm } from "./training-forms";

export const dynamic = "force-dynamic";

export default async function CoachingTrainingPage({ params }: { params: Promise<{ seasonClubId: string }> }) {
  const { seasonClubId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);

  const [week, plans] = await Promise.all([
    withOrganizationContext(scope.organizationId, (tx) => loadTrainingWeek(tx, scope.organizationId, seasonClubId)),
    withOrganizationContext(scope.organizationId, (tx) => loadAssignablePlans(tx, scope.organizationId, seasonClubId)),
  ]);

  const base = `/coaching/${seasonClubId}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Training</h1>
      <p className="mt-1 text-sm text-text-2">
        {formatDate(week.from)} - {formatDate(week.to)} · <Num>{week.completedCount}</Num> of <Num>{week.rows.length}</Num> sessions
        complete
        {week.overdueCount > 0 ? <span className="text-warn"> · {week.overdueCount} overdue</span> : null}.
      </p>

      <SectionTitle>Assign an adopted plan</SectionTitle>
      <Card>
        <p className="text-xs text-text-3">
          A session assigned to a plan stamps that plan&apos;s focus on the player&apos;s training record, so the week
          carries the plan instead of a PDF.
        </p>
        <AssignForm action={assignSession.bind(null, seasonClubId)} plans={plans} seasonClubId={seasonClubId} />
      </Card>

      <SectionTitle>This week</SectionTitle>
      {week.rows.length === 0 ? (
        <p className="text-sm text-text-2">No sessions in this window.</p>
      ) : (
        <ul className="space-y-2">
          {week.rows.map((row) => (
            <li key={row.id} data-session={row.id}>
              <Link href={`${base}/training/${row.id}`}>
                <Card quiet={Boolean(row.completedAt)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-text-1">{row.title}</span>
                    <span className={`text-xs ${row.overdue ? "text-warn" : row.completedAt ? "text-success" : "text-text-3"}`}>
                      {row.completedAt ? "complete" : row.overdue ? "overdue" : row.sessionType.replace("_", " ").toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-3">
                    {formatDate(row.occurredAt)}
                    {row.durationMinutes ? ` · ${row.durationMinutes} min` : ""}
                    {row.plan?.playerName ? ` · ${row.plan.playerName}` : ""}
                    {row.plan ? ` · plan (${row.plan.focusCount} focus area${row.plan.focusCount === 1 ? "" : "s"})` : " · no plan attached"}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
