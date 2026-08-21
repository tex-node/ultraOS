import { writeAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";
const EVENT_ID = "seed-event-season-zero-launch";
const EXHIBITION_MATCH_ID = "cmsp9x15w0004kxkk40iztezy";
const SPONSOR_ID = "seed-campaign-refresh-season-zero";

const fixtures = [
  { id: "cmsp9a72000004pkk8hx0mlzs", time: "10:00", label: "Eclipse vs Ember" },
  { id: "cmsp9a72y00024pkkblu1v755", time: "10:35", label: "Apex vs Flux" },
  { id: "cmsp9a73700044pkkc7hlibcl", time: "11:10", label: "Eclipse vs Halo" },
  { id: "cmsp9a73g00064pkkfilc2sve", time: "11:45", label: "Apex vs Surge" },
  { id: "cmsp9a73p00084pkkmdiw8ic1", time: "12:20", label: "Eclipse vs Nova" },
  { id: "cmsp9a741000a4pkk4b1ckf84", time: "12:55", label: "Apex vs Vortex" },
  { id: "cmsp9a74b000c4pkk6odrffxt", time: "13:30", label: "Ember vs Halo" },
  { id: "cmsp9a74j000e4pkka6v3qmsx", time: "14:05", label: "Flux vs Surge" },
  { id: "cmsp9a74r000g4pkk5ta3tc49", time: "14:40", label: "Ember vs Nova" },
  { id: "cmsp9a74y000i4pkkwu4qb4gx", time: "15:15", label: "Flux vs Vortex" },
  { id: "cmsp9a755000k4pkknteevnb6", time: "15:50", label: "Halo vs Nova" },
  { id: "cmsp9a75d000m4pkk5achuyne", time: "16:25", label: "Surge vs Vortex" },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const f of fixtures) {
      const before = await tx.fixture.findUniqueOrThrow({ where: { id: f.id } });
      const scheduledAt = new Date(`2026-08-15T${f.time}:00+01:00`);
      await tx.fixture.update({ where: { id: f.id }, data: { scheduledAt } });
      await writeAuditLog(tx, {
        action: "FIXTURE_EDITED",
        details: { newScheduledAt: scheduledAt.toISOString(), oldScheduledAt: before.scheduledAt.toISOString(), reason: "Schedule shifted to a 10:00am start." },
        entityId: f.id,
        entityType: "Fixture",
        userId: ACTOR_ID,
      });
      console.log(`${f.label}: ${f.time}`);
    }

    const exhibitionTime = new Date("2026-08-15T17:00:00+01:00");
    const beforeMatch = await tx.noveltyMatch.findUniqueOrThrow({ where: { id: EXHIBITION_MATCH_ID } });
    await tx.noveltyMatch.update({ where: { id: EXHIBITION_MATCH_ID }, data: { scheduledAt: exhibitionTime } });
    await writeAuditLog(tx, {
      action: "NOVELTY_MATCH_RESCHEDULED",
      details: { newScheduledAt: exhibitionTime.toISOString(), oldScheduledAt: beforeMatch.scheduledAt.toISOString(), reason: "Schedule shifted to a 10:00am start." },
      entityId: EXHIBITION_MATCH_ID,
      entityType: "NoveltyMatch",
      userId: ACTOR_ID,
    });
    console.log("Exhibition: 17:00");

    const beforeEvent = await tx.event.findUniqueOrThrow({ where: { id: EVENT_ID } });
    const startTime = new Date("2026-08-15T10:00:00+01:00");
    const doorsOpenTime = new Date("2026-08-15T08:00:00+01:00");
    await tx.event.update({ where: { id: EVENT_ID }, data: { doorsOpenTime, startTime } });
    await writeAuditLog(tx, {
      action: "EVENT_DETAILS_CORRECTED",
      details: {
        newDoorsOpenTime: doorsOpenTime.toISOString(),
        newStartTime: startTime.toISOString(),
        oldDoorsOpenTime: beforeEvent.doorsOpenTime?.toISOString(),
        oldStartTime: beforeEvent.startTime.toISOString(),
        reason: "Schedule shifted to a 10:00am start.",
      },
      entityId: EVENT_ID,
      entityType: "Event",
      userId: ACTOR_ID,
    });
    console.log("Event startTime: 10:00, doorsOpenTime: 09:00");

    const sponsor = await tx.sponsorCampaign.findUnique({ where: { id: SPONSOR_ID } });
    if (sponsor?.isActive) {
      await tx.sponsorCampaign.update({ where: { id: SPONSOR_ID }, data: { isActive: false } });
      await writeAuditLog(tx, {
        action: "SPONSOR_CAMPAIGN_DEACTIVATED",
        details: { reason: "Confirmed placeholder data, not a real sponsor.", sponsorName: sponsor.sponsorName },
        entityId: SPONSOR_ID,
        entityType: "SponsorCampaign",
        userId: ACTOR_ID,
      });
      console.log("Placeholder sponsor deactivated.");
    } else {
      console.log("Sponsor already inactive or not found.");
    }
  });
}

main().finally(() => prisma.$disconnect());
