import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  MediaVisibility,
  PublicResourceLocatorType,
} from "@/generated/prisma/enums";
import { readLocalMediaObject } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const url = new URL(request.url);
  const variantName = url.searchParams.get("variant");
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.MEDIA_ASSET,
    assetId,
  );
  if (!locator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asset = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.mediaAsset.findUnique({
      where: { id: locator.resourceId },
      include: { variants: true },
    }),
  );
  if (!asset || !locatorMatchesResource(locator, asset) || asset.status === "ARCHIVED" || asset.status === "REJECTED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.visibility !== MediaVisibility.PUBLIC) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.organizationId !== asset.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.publicUrl && asset.storageProvider === "CLOUDFLARE_OBJECT_STORAGE") {
    return NextResponse.redirect(asset.publicUrl);
  }

  const variant = variantName ? asset.variants.find((item) => item.name === variantName) : null;
  const objectKey = variant?.objectKey ?? asset.objectKey;
  const mimeType = variant?.mimeType ?? asset.mimeType;
  const bytes = await readLocalMediaObject(objectKey);
  return new NextResponse(bytes, {
    headers: {
      "Cache-Control": asset.visibility === MediaVisibility.PUBLIC ? "public, max-age=31536000, immutable" : "private, max-age=0, no-store",
      "Content-Type": mimeType,
    },
  });
}
