import QRCode from "qrcode";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(code)) {
    return new Response("Invalid code", { status: 400 });
  }

  const baseUrl =
    process.env.AUTH_URL ??
    new URL(request.url).origin;
  const png = await QRCode.toBuffer(`${baseUrl}/check-in/${code}`, {
    type: "png",
    width: 360,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
