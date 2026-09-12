import { NextResponse } from "next/server";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export async function GET(_: Request, { params }: { params: Promise<{ ultraStaffId: string }> }) {
  const { ultraStaffId } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const staff = await withOrganizationContext(organization.id, (tx) =>
    tx.staff.findUnique({
      where: { ultraStaffId },
      include: {
        headCoachAssignments: { include: { club: true, division: true, season: true } },
        assistantCoachAssignments: { include: { club: true, division: true, season: true } },
      },
    }),
  );
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ultraStaffId: staff.ultraStaffId,
    name: staff.name,
    role: staff.role,
    currentAssignments: [...staff.headCoachAssignments, ...staff.assistantCoachAssignments].map((assignment) => ({
      club: assignment.club.name,
      division: assignment.division.name,
      season: assignment.season.name,
    })),
  });
}
