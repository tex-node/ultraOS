import type { ReactNode } from "react";
import { ReportsNav } from "./reports-nav";

// Shared reports shell: tab navigation plus print rules so Quick Print outputs the report,
// not the app chrome.
export default async function ReportsLayout({
  params,
  children,
}: {
  params: Promise<{ fixtureId: string }>;
  children: ReactNode;
}) {
  const { fixtureId } = await params;
  return (
    <>
      <style>{`@media print {
        .no-print { display: none !important; }
        main { max-width: none !important; padding: 0 !important; }
        body { background: #fff !important; color: #000 !important; }
        section, table { break-inside: avoid; }
      }`}</style>
      <ReportsNav fixtureId={fixtureId} />
      {children}
    </>
  );
}