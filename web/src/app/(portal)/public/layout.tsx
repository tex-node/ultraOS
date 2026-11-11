import { PortalShell } from "@/app/components/portal-shell";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
