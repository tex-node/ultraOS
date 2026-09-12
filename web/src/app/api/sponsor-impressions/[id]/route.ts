import { NextResponse } from "next/server";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const organization = await resolveDefaultPublicOrganization();
  await withOrganizationContext(organization.id, (tx) =>
    tx.sponsorCampaign.updateMany({
      where: { id, isActive: true },
      data: { impressions: { increment: 1 } },
    }),
  );
  return NextResponse.json({ ok: true });
}
