import type { GraphicData } from "@/lib/content-engine";
import {
  renderContentPdf,
  renderGraphicPng,
} from "@/lib/content-renderers";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; format: string }> },
) {
  await requirePermission("content:manage");
  const { slug, format } = await params;
  const asset = await prisma.contentAsset.findUnique({ where: { slug } });
  if (!asset) return new Response("Not found", { status: 404 });
  const filename = `${slug}.${format === "text" ? "txt" : format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
  switch (format) {
    case "text":
      return new Response(asset.textContent, {
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
    case "html":
      return new Response(asset.htmlContent, {
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      });
    case "json":
      return Response.json(asset.graphicData, { headers });
    case "png": {
      const png = await renderGraphicPng(
        asset.graphicData as unknown as GraphicData,
      );
      return new Response(new Uint8Array(png), {
        headers: { ...headers, "Content-Type": "image/png" },
      });
    }
    case "pdf": {
      const pdf = await renderContentPdf(asset.title, asset.textContent);
      return new Response(new Uint8Array(pdf), {
        headers: { ...headers, "Content-Type": "application/pdf" },
      });
    }
    default:
      return new Response("Unsupported format", { status: 404 });
  }
}
