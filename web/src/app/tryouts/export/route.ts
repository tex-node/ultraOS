import { NextRequest, NextResponse } from "next/server";
import { DraftSelectionGroup } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const { organizationId } = await requirePermissionWithOrganization("draft:manage");
  const group = request.nextUrl.searchParams.get("group");
  const where = Object.values(DraftSelectionGroup).includes(group as DraftSelectionGroup)
    ? { draftSelectionGroup: group as DraftSelectionGroup }
    : {};

  const players = await withOrganizationContext(organizationId, (tx) => tx.player.findMany({
    include: {
      athlete: true,
      season: true,
      seasonClub: { include: { club: true, division: true } },
    },
    orderBy: [{ draftSelectionGroup: "asc" }, { athlete: { lastName: "asc" } }],
    where,
  }));

  const rows = [
    [
      "Full name",
      "Gender",
      "Email",
      "Phone",
      "Season",
      "Division",
      "SeasonClub",
      "Position",
      "Status",
      "Draft selection group",
      "Tryout number",
      "Tryout score",
      "Selection notes",
    ],
    ...players.map((player) => [
      `${player.athlete.firstName} ${player.athlete.lastName}`,
      player.athlete.gender,
      player.athlete.email,
      player.athlete.phone,
      player.season.name,
      player.seasonClub?.division.name,
      player.seasonClub?.club.name,
      player.position,
      player.status,
      player.draftSelectionGroup,
      player.tryoutNumber,
      player.tryoutScore?.toString(),
      player.selectionNotes,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = group ? `tryouts-${group.toLowerCase()}.csv` : "tryouts.csv";

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
