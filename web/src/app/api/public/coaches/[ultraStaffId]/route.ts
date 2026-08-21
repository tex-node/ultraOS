import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ ultraStaffId: string }> }) {
  const { ultraStaffId } = await params;
  const staff = await prisma.staff.findUnique({
    where: { ultraStaffId },
    include: {
      headCoachAssignments: { include: { club: true, division: true, season: true } },
      assistantCoachAssignments: { include: { club: true, division: true, season: true } },
    },
  });
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
