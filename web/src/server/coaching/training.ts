import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import type { CoachingPlanSnapshot } from "@/lib/coaching/plan-snapshot";

// P15 I3: the training execution loop. An adopted plan becomes a session, the session is completed by
// the coach, and the plan's target metric is logged against it - so the plan stops being a document.
//
// Two rules worth knowing:
//   - `AthleteTrainingRecord.developmentFocus` is PER SESSION (the column's own model), and I2
//     deliberately did not invent a session at adoption time. Here a real session exists, so this is
//     where the focus text is stamped - exactly as the I2 handover said it would be.
//   - Completion is a timestamp, not a status enum: `completedAt` null = not done. The metric log is
//     separate (AthleteTrainingMetric), so a session can be completed without a metric when the coach
//     has nothing recorded yet.

export type AssignTrainingSessionArgs = {
  organizationId: string;
  userId: string;
  planId: string;
  sessionId?: string;
  // Used only when creating a new session.
  title?: string;
  occurredAt?: Date;
  durationMinutes?: number;
  sessionType?: "TEAM_PRACTICE" | "SKILLS" | "STRENGTH" | "CONDITIONING" | "SHOOTING" | "TACTICAL" | "RECOVERY";
  notes?: string;
};

export type AssignResult = { ok: true; sessionId: string; created: boolean } | { ok: false; error: string };

function focusSummary(snapshot: CoachingPlanSnapshot | null): string {
  if (!snapshot || snapshot.focusAreas.length === 0) return "Development plan focus";
  return snapshot.focusAreas.map((area) => `${area.label} (target ${area.target.label})`).join("; ").slice(0, 500);
}

export async function assignPlanToSession(tx: Prisma.TransactionClient, args: AssignTrainingSessionArgs): Promise<AssignResult> {
  const plan = await tx.coachingPlan.findFirst({
    where: { id: args.planId, organizationId: args.organizationId },
    select: { id: true, playerId: true, seasonClubId: true, status: true, focusAreas: true, player: { select: { seasonId: true, athleteId: true } } },
  });
  if (!plan) return { ok: false, error: "Plan not found." };
  if (plan.status !== "ACTIVE") return { ok: false, error: `This plan is ${plan.status}; only an ACTIVE plan can be assigned to training.` };

  const snapshot = plan.focusAreas as unknown as CoachingPlanSnapshot | null;
  let sessionId = args.sessionId ?? null;
  let created = false;

  if (sessionId) {
    const session = await tx.trainingSession.findFirst({ where: { id: sessionId, organizationId: args.organizationId }, select: { id: true, seasonClubId: true } });
    if (!session) return { ok: false, error: "Training session not found." };
    if (session.seasonClubId && session.seasonClubId !== plan.seasonClubId) {
      return { ok: false, error: "That session belongs to a different club's squad." };
    }
    await tx.trainingSession.update({ where: { id: session.id }, data: { coachingPlanId: plan.id } });
  } else {
    const session = await tx.trainingSession.create({
      data: {
        organizationId: args.organizationId,
        seasonId: plan.player?.seasonId ?? null,
        seasonClubId: plan.seasonClubId,
        title: args.title?.trim() || `${focusSummary(snapshot).split(";")[0]} session`,
        sessionType: args.sessionType ?? "SKILLS",
        occurredAt: args.occurredAt ?? new Date(),
        durationMinutes: args.durationMinutes ?? null,
        notes: args.notes ?? null,
        coachingPlanId: plan.id,
        createdById: args.userId,
      },
      select: { id: true },
    });
    sessionId = session.id;
    created = true;
  }

  // Stamp the plan's focus on the player's record FOR THIS SESSION, creating the participant record if
  // the session has none yet (a coach-assigned session is for exactly one player's plan).
  if (plan.player?.athleteId) {
    const record = await tx.athleteTrainingRecord.findFirst({
      where: { trainingSessionId: sessionId, athleteId: plan.player.athleteId },
      select: { id: true },
    });
    const focus = focusSummary(snapshot);
    if (record) {
      await tx.athleteTrainingRecord.update({ where: { id: record.id }, data: { developmentFocus: focus, playerId: plan.playerId } });
    } else {
      await tx.athleteTrainingRecord.create({
        data: {
          organizationId: args.organizationId,
          trainingSessionId: sessionId,
          athleteId: plan.player.athleteId,
          playerId: plan.playerId,
          attendanceStatus: "PRESENT",
          developmentFocus: focus,
          createdById: args.userId,
        },
      });
    }
  }

  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "TRAINING_SESSION_ASSIGNED",
    entityType: "TrainingSession",
    entityId: sessionId,
    details: { planId: plan.id, playerId: plan.playerId, created },
  });

  return { ok: true, sessionId, created };
}

export type CompleteSessionArgs = {
  organizationId: string;
  userId: string;
  sessionId: string;
  note?: string | null;
  // The plan's target metric as the coach logged it (e.g. game.ft_pct: 80 for "8/10").
  metrics?: { key: string; numericValue: number }[];
  attendanceStatus?: "PRESENT" | "LATE" | "EXCUSED" | "ABSENT" | "LIMITED";
};

export type CompleteResult = { ok: true } | { ok: false; error: string };

export async function completeTrainingSession(tx: Prisma.TransactionClient, args: CompleteSessionArgs): Promise<CompleteResult> {
  const session = await tx.trainingSession.findFirst({
    where: { id: args.sessionId, organizationId: args.organizationId },
    select: { id: true, completedAt: true, coachingPlanId: true, notes: true },
  });
  if (!session) return { ok: false, error: "Training session not found." };

  await tx.trainingSession.update({
    where: { id: session.id },
    data: {
      completedAt: session.completedAt ?? new Date(),
      notes: args.note?.trim() ? [session.notes, args.note.trim()].filter(Boolean).join("\n") : session.notes,
    },
  });

  if (args.metrics?.length) {
    const records = await tx.athleteTrainingRecord.findMany({ where: { trainingSessionId: session.id }, select: { id: true, athleteId: true } });
    for (const record of records) {
      if (args.attendanceStatus) {
        await tx.athleteTrainingRecord.update({ where: { id: record.id }, data: { attendanceStatus: args.attendanceStatus } });
      }
      for (const metric of args.metrics) {
        const definition = await tx.trainingMetricDefinition.findUnique({ where: { key: metric.key }, select: { id: true } });
        if (!definition) continue; // a metric the platform does not define is skipped, not invented
        await tx.athleteTrainingMetric.upsert({
          where: { athleteTrainingRecordId_metricDefinitionId: { athleteTrainingRecordId: record.id, metricDefinitionId: definition.id } },
          update: { numericValue: metric.numericValue },
          create: { organizationId: args.organizationId, athleteTrainingRecordId: record.id, metricDefinitionId: definition.id, numericValue: metric.numericValue },
        });
      }
    }
  }

  await writeAuditLog(tx, {
    organizationId: args.organizationId,
    userId: args.userId,
    action: "TRAINING_SESSION_COMPLETED",
    entityType: "TrainingSession",
    entityId: session.id,
    details: { planId: session.coachingPlanId, metrics: args.metrics ?? [] },
  });
  return { ok: true };
}

export type TrainingSessionRow = {
  id: string;
  title: string;
  sessionType: string;
  occurredAt: Date;
  durationMinutes: number | null;
  completedAt: Date | null;
  overdue: boolean;
  plan: { id: string; playerName: string | null; focusCount: number } | null;
  participantCount: number;
};

// The Coach Hub's training tab: this week's sessions (a 7-day window around now), overdue first.
export async function loadTrainingWeek(tx: Prisma.TransactionClient, organizationId: string, seasonClubId: string, now = new Date()) {
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sessions = await tx.trainingSession.findMany({
    where: { organizationId, seasonClubId, occurredAt: { gte: from, lte: to } },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      title: true,
      sessionType: true,
      occurredAt: true,
      durationMinutes: true,
      completedAt: true,
      participants: { select: { id: true } },
      coachingPlan: {
        select: { id: true, focusAreas: true, player: { select: { athlete: { select: { firstName: true, lastName: true } } } } },
      },
    },
  });
  const rows: TrainingSessionRow[] = sessions.map((session) => {
    const snapshot = session.coachingPlan?.focusAreas as unknown as CoachingPlanSnapshot | null;
    return {
      id: session.id,
      title: session.title,
      sessionType: session.sessionType,
      occurredAt: session.occurredAt,
      durationMinutes: session.durationMinutes,
      completedAt: session.completedAt,
      overdue: !session.completedAt && session.occurredAt.getTime() < now.getTime(),
      plan: session.coachingPlan
        ? {
            id: session.coachingPlan.id,
            playerName: session.coachingPlan.player ? `${session.coachingPlan.player.athlete.firstName} ${session.coachingPlan.player.athlete.lastName}` : null,
            focusCount: snapshot?.focusAreas.length ?? 0,
          }
        : null,
      participantCount: session.participants.length,
    };
  });
  return {
    from,
    to,
    rows,
    overdueCount: rows.filter((row) => row.overdue).length,
    completedCount: rows.filter((row) => row.completedAt).length,
  };
}

export async function loadTrainingSession(tx: Prisma.TransactionClient, organizationId: string, sessionId: string) {
  const session = await tx.trainingSession.findFirst({
    where: { id: sessionId, organizationId },
    select: {
      id: true,
      title: true,
      sessionType: true,
      occurredAt: true,
      durationMinutes: true,
      notes: true,
      completedAt: true,
      seasonClubId: true,
      participants: {
        select: {
          id: true,
          attendanceStatus: true,
          developmentFocus: true,
          athlete: { select: { firstName: true, lastName: true } },
          metrics: { select: { numericValue: true, metricDefinition: { select: { key: true, name: true, unit: true } } } },
        },
      },
      coachingPlan: {
        select: { id: true, status: true, focusAreas: true, player: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } } } },
      },
    },
  });
  if (!session) return null;
  const snapshot = session.coachingPlan?.focusAreas as unknown as CoachingPlanSnapshot | null;
  return {
    ...session,
    plan: session.coachingPlan
      ? {
          id: session.coachingPlan.id,
          status: session.coachingPlan.status,
          playerId: session.coachingPlan.player?.id ?? null,
          playerName: session.coachingPlan.player ? `${session.coachingPlan.player.athlete.firstName} ${session.coachingPlan.player.athlete.lastName}` : null,
          focusAreas: (snapshot?.focusAreas ?? []).map((area) => ({ label: area.label, metricKey: area.metricKey, metricLabel: area.metricLabel, targetLabel: area.target.label, reviewWindowGames: area.target.reviewWindowGames })),
        }
      : null,
  };
}

export type PlanTrendArea = {
  metricKey: string;
  metricLabel: string;
  unit: string | null;
  targetValue: number | null;
  targetLabel: string;
  reviewWindowGames: number;
  /** One entry per COMPLETED session assigned to this plan. `value` is null when the coach logged no
   *  metric for that session - the card says "Missing data" there rather than plotting a zero, because
   *  a zero is a measurement and a blank is not. */
  points: { sessionId: string; occurredAt: Date; value: number | null }[];
  gamesSinceAdoption: number;
};

// The logged-vs-target series for an adopted plan's focus areas, used by the player page's trend card.
//
// TWO CLOCKS, kept apart on purpose:
//   - the plan's review window is in GAMES (it is a box-score plan), so `gamesSinceAdoption` counts the
//     player's games after the adoption date;
//   - the training metric is logged per SESSION, so `points` is one entry per completed session that was
//     assigned to this plan - including the sessions with no metric, which render as "Missing data".
export async function loadPlanTrainingTrend(tx: Prisma.TransactionClient, organizationId: string, planId: string, take = 12): Promise<PlanTrendArea[]> {
  const plan = await tx.coachingPlan.findFirst({
    where: { id: planId, organizationId },
    select: { focusAreas: true, adoptedAt: true, playerId: true, player: { select: { athleteId: true } } },
  });
  if (!plan) return [];
  const snapshot = plan.focusAreas as unknown as CoachingPlanSnapshot | null;
  const areas = snapshot?.focusAreas ?? [];
  if (areas.length === 0) return [];
  const athleteId = plan.player?.athleteId;
  const empty = () =>
    areas.map((area) => ({
      metricKey: area.metricKey,
      metricLabel: area.metricLabel,
      unit: null,
      targetValue: typeof area.target.value === "number" ? area.target.value : null,
      targetLabel: area.target.label,
      reviewWindowGames: area.target.reviewWindowGames,
      points: [] as PlanTrendArea["points"],
      gamesSinceAdoption: 0,
    }));

  // Sessions assigned to THIS plan, completed, with the player's record and its logged metrics.
  const sessions = await tx.trainingSession.findMany({
    where: { organizationId, coachingPlanId: planId, completedAt: { not: null } },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      participants: athleteId
        ? { where: { athleteId }, select: { metrics: { select: { numericValue: true, metricDefinition: { select: { key: true, unit: true } } } } } }
        : { where: { athleteId: "__none__" }, select: { metrics: { select: { numericValue: true, metricDefinition: { select: { key: true, unit: true } } } } } },
    },
  });

  const gamesSinceAdoption = plan.playerId
    ? await tx.playerStat.count({ where: { organizationId, playerId: plan.playerId, game: { fixture: { scheduledAt: { gte: plan.adoptedAt } } } } })
    : 0;

  if (sessions.length === 0) {
    const base = empty();
    return base.map((area) => ({ ...area, gamesSinceAdoption }));
  }

  return areas.map((area) => {
    let unit: string | null = null;
    const points = sessions.slice(-take).map((session) => {
      const record = session.participants[0];
      const metric = record?.metrics.find((candidate) => candidate.metricDefinition.key === area.metricKey);
      if (metric?.metricDefinition.unit) unit = metric.metricDefinition.unit;
      return {
        sessionId: session.id,
        occurredAt: session.occurredAt,
        value: metric && metric.numericValue !== null ? Number(metric.numericValue) : null,
      };
    });
    return {
      metricKey: area.metricKey,
      metricLabel: area.metricLabel,
      unit,
      targetValue: typeof area.target.value === "number" ? area.target.value : null,
      targetLabel: area.target.label,
      reviewWindowGames: area.target.reviewWindowGames,
      points,
      gamesSinceAdoption,
    };
  });
}

// Every session in the season that already carries a plan, for the "adopt → assign" picker.
export async function loadAssignablePlans(tx: Prisma.TransactionClient, organizationId: string, seasonClubId: string) {
  const plans = await tx.coachingPlan.findMany({
    where: { organizationId, seasonClubId, status: "ACTIVE" },
    orderBy: { adoptedAt: "desc" },
    select: {
      id: true,
      adoptedAt: true,
      focusAreas: true,
      player: { select: { id: true, jerseyNumber: true, athlete: { select: { firstName: true, lastName: true } } } },
      sessions: { orderBy: { occurredAt: "desc" }, take: 1, select: { id: true, occurredAt: true, completedAt: true } },
    },
  });
  return plans.map((plan) => {
    const snapshot = plan.focusAreas as unknown as CoachingPlanSnapshot | null;
    return {
      id: plan.id,
      adoptedAt: plan.adoptedAt,
      playerId: plan.player.id,
      playerName: `${plan.player.athlete.firstName} ${plan.player.athlete.lastName}`,
      jerseyNumber: plan.player.jerseyNumber,
      focusAreas: (snapshot?.focusAreas ?? []).map((area) => ({ label: area.label, metricKey: area.metricKey, metricLabel: area.metricLabel, targetLabel: area.target.label })),
      lastSession: plan.sessions[0] ?? null,
    };
  });
}
