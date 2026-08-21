import { NextRequest, NextResponse } from "next/server";
import { ImportType } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";
import { csvTemplate } from "@/lib/imports";

function permissionForType(type: ImportType) {
  if (type === ImportType.PLAYER) return "data:import:players" as const;
  if (type === ImportType.COACH) return "data:import:coaches" as const;
  return "data:import:clubs" as const;
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (!type || !Object.values(ImportType).includes(type as ImportType)) {
    return NextResponse.json({ error: "Valid import type is required." }, { status: 400 });
  }
  await requirePermission(permissionForType(type as ImportType));
  const csv = csvTemplate(type as ImportType);
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${type.toLowerCase()}-import-template.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
