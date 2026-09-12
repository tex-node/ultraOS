import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { getRegistration, listRegistrations } from "@/lib/registration/service";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(session.user.roles, "event:manage")) return new Response("Forbidden", { status: 403 });
  const organizationId = session.user.organizationId;
  if (!organizationId) return new Response("Forbidden", { status: 403 });

  const rows = await listRegistrations(organizationId);
  const header = ["referenceNumber", "status", "teamName", "teamClubOrSchool", "teamCategory", "participants", "volleyballRoster", "flagRaceRoster", "submittedAt", "reviewedAt"];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    const full = await getRegistration(organizationId, row.id);
    const participants = full?.participants ?? [];
    const volleyball = participants.filter((participant) => participant.sportMemberships.some((membership) => membership.sport === "VOLLEYBALL")).map((participant) => participant.fullName).join("; ");
    const flagRace = participants
      .filter((participant) => participant.sportMemberships.some((membership) => membership.sport === "FLAG_RACE"))
      .map((participant) => {
        const membership = participant.sportMemberships.find((item) => item.sport === "FLAG_RACE");
        return `${membership?.rosterOrder ?? "?"}:${participant.fullName}`;
      })
      .join("; ");
    lines.push([row.referenceNumber, row.status, row.teamName, row.teamClubOrSchool, row.teamCategory, row._count.participants, volleyball, flagRace, row.submittedAt?.toISOString() ?? "", row.reviewedAt?.toISOString() ?? ""].map(csvCell).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
