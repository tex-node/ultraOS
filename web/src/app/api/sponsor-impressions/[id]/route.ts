import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.sponsorCampaign.updateMany({
    where: { id, isActive: true },
    data: { impressions: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
