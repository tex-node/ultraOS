import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachingClub } from "@/server/coaching/guard";
import { loadTrainingSession } from "@/server/coaching/training";
import { withOrganizationContext } from "@/lib/tenant-context";
import { Card, Num, SectionTitle, formatDate } from "../../../_components/ui";
import { completeSession } from "../actions";
import { CompleteForm } from "../training-forms";
import { loadVisionMetricsForSession } from "@/server/vision/training-bridge";

export const dynamic = "force-dynamic";

export default async function CoachingTrainingSessionPage({ params }: { params: Promise<{ seasonClubId: string; sessionId: string }> }) {
  const { seasonClubId, sessionId } = await params;
  const { scope } = await requireCoachingClub(seasonClubId);

  const session = await withOrganizationContext(scope.organizationId, (tx) => loadTrainingSession(tx, scope.organizationId, sessionId));
  if (!session || (session.seasonClubId && session.seasonClubId !== seasonClubId)) notFound();

  // Vision-derived metrics (streak v13, Prompt 2): a clip linked to this session, analysed, and mapped to a metric -
  // shown with the detector's own name so a coach knows where the number came from.
  const visionMetrics = await withOrganizationContext(scope.organizationId, (tx) =>
    loadVisionMetricsForSession(tx, scope.organizationId, sessionId),
  );

  const logged = new Map<string, string>();
  for (const participant of session.participants) {
    for (const metric of participant.metrics) {
      if (metric.numericValue !== null) logged.set(metric.metricDefinition.key, String(metric.numericValue));
    }
  }

  return (
    <div>
      <p className="text-xs text-text-3">
        <Link href={`/coaching/${seasonClubId}/training`} className="text-info underline">
          Training week
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold text-text-1">{session.title}</h1>
      <p className="mt-1 text-sm text-text-2">
        {formatDate(session.occurredAt)}
        {session.durationMinutes ? ` · ${session.durationMinutes} min` : ""} · {session.sessionType.replace("_", " ").toLowerCase()}
        {session.completedAt ? " · complete" : " · not complete"}
      </p>

      {session.plan ? (
        <>
          <SectionTitle>Plan</SectionTitle>
          <Card>
            <p className="text-sm text-text-1">
              {session.plan.playerName ?? "Player"} · <span className="text-text-3">{session.plan.status}</span>
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs text-text-2">
              {session.plan.focusAreas.map((area) => (
                <li key={area.metricKey}>
                  {area.label} - target {area.targetLabel} ({area.metricLabel}, review after {area.reviewWindowGames} games)
                </li>
              ))}
            </ul>
            {session.plan.playerId ? (
              <p className="mt-2 text-xs">
                <Link href={`/coaching/${seasonClubId}/players/${session.plan.playerId}`} className="text-info underline">
                  Player development plan
                </Link>
              </p>
            ) : null}
          </Card>
        </>
      ) : (
        <p className="mt-3 text-sm text-text-3">No plan attached to this session.</p>
      )}

      {visionMetrics.length > 0 ? (
        <>
          <SectionTitle>From video</SectionTitle>
          <Card>
            <p className="text-xs text-text-3">Recorded by the vision pipeline from a clip linked to this session (YOLOv8n person detection).</p>
            <ul className="mt-1 space-y-1 text-sm text-text-1">
              {visionMetrics.map((metric) => (
                <li key={metric.metricKey}>
                  {metric.name}: <b>{metric.value}</b>
                  {metric.unit ? ` ${metric.unit}` : ""}
                  <span className="ml-2 text-xs text-text-3">(attached to {metric.athleteCount} athlete{metric.athleteCount === 1 ? "" : "s"})</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {session.participants.length > 0 ? (
        <>
          <SectionTitle>Participants</SectionTitle>
          <ul className="space-y-2">
            {session.participants.map((participant) => (
              <li key={participant.id}>
                <Card quiet>
                  <p className="text-sm text-text-1">
                    {participant.athlete.firstName} {participant.athlete.lastName} · {participant.attendanceStatus.toLowerCase()}
                  </p>
                  {participant.developmentFocus ? <p className="mt-1 text-xs text-text-2">{participant.developmentFocus}</p> : null}
                  {participant.metrics.length > 0 ? (
                    <p className="mt-1 text-xs text-text-3">
                      {participant.metrics.map((metric) => `${metric.metricDefinition.name}: ${metric.numericValue ?? "-"}${metric.metricDefinition.unit ? ` ${metric.metricDefinition.unit}` : ""}`).join(" · ")}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionTitle>Complete this session</SectionTitle>
      <Card>
        <p className="text-xs text-text-3">
          Log the metric the plan targets; the plan page shows the trend across its <Num>{session.plan?.focusAreas[0]?.reviewWindowGames ?? 6}</Num>-game window.
        </p>
        <CompleteForm
          action={completeSession.bind(null, seasonClubId, sessionId)}
          seasonClubId={seasonClubId}
          session={{
            id: session.id,
            title: session.title,
            occurredAt: session.occurredAt.toISOString(),
            completedAt: session.completedAt?.toISOString() ?? null,
            playerName: session.plan?.playerName ?? null,
            focusAreas: (session.plan?.focusAreas ?? []).map((area) => ({ ...area, loggedValue: logged.get(area.metricKey) ?? null })),
          }}
        />
      </Card>
    </div>
  );
}
