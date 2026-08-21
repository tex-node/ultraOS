// CORS policy for the public API v1 (G.20, Part XXI). Intentional, not `*`. Allowed origins are
// environment-driven (PUBLIC_API_ALLOWED_ORIGINS, comma-separated) so production can name the
// real official website/future mobile app/trusted partner origins without a code change; falls
// back to just this app's own public origin (AUTH_URL, the same env var layout.tsx already uses
// for metadataBase) if unset, which is always safe since same-origin requests don't need CORS
// headers to function anyway - the fallback only matters for cross-origin browser JS callers,
// and defaulting to "nothing extra allowed" is the safe default until explicitly configured.
//
// This only ever applies to /api/v1/* - internal admin/broadcast endpoints never call into this
// module, so they can never accidentally become cross-origin public (Part XXI's own warning).
function allowedOrigins(): string[] {
  const configured = process.env.PUBLIC_API_ALLOWED_ORIGINS;
  if (configured) return configured.split(",").map((o) => o.trim()).filter(Boolean);
  const own = process.env.AUTH_URL;
  return own ? [own] : [];
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowed = allowedOrigins();
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
