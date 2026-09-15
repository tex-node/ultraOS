// Public short links: memorable top-level URLs that resolve to an organization + event slug.
// Keep this the single source of truth so a brand URL like app.neonultra.ng/giesm can be served
// without changing route code, and so the mapping is auditable in one place.

export type PublicShortLink = {
  organizationSlug: string;
  eventSlug: string;
};

export const PUBLIC_SHORT_LINKS: Record<string, PublicShortLink> = {
  giesm: { organizationSlug: "neon-ultra", eventSlug: "giesm" },
};

export function resolvePublicShortLink(slug: string | null | undefined): PublicShortLink | null {
  if (!slug) return null;
  return PUBLIC_SHORT_LINKS[slug.trim().toLowerCase()] ?? null;
}
