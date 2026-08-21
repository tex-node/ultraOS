import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MediaVisibility } from "@/generated/prisma/enums";
import { readLocalMediaObject } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const url = new URL(request.url);
  const variantName = url.searchParams.get("variant");
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    include: { variants: true },
  });
  if (!asset || asset.status === "ARCHIVED" || asset.status === "REJECTED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.visibility !== MediaVisibility.PUBLIC) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
