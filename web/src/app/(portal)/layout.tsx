export const dynamic = "force-dynamic";

// (portal) — everything the public sees: the homepage, tournament sub-sites, the public event pages, auth screens, and the
// embeddable widgets.
//
// WHY THIS LAYOUT DOES NOT RENDER THE SHELL ITSELF. A tournament sub-site is not the same chrome as the homepage: it carries a
// hero banner with live status, share controls and its own tab strip (see (portal)/t/.../layout.tsx), and the vanity-slug
// tournaments do the same behind a different address. Forcing one shell here would mean either duplicating that chrome or
// flattening it. The group's job is to keep public routes physically together and out of the workspace; the chrome is supplied
// by the segment that actually knows what it is rendering.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
