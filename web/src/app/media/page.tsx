import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { validateMediaConfiguration } from "@/lib/media-storage";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function MediaPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/media");
  const { session, organizationId } = await requirePermissionWithOrganization("media:read");
  const { assets, counts } = await withOrganizationContext(organizationId, async (tx) => {
    const [assets, counts] = await Promise.all([
      tx.mediaAsset.findMany({
        where: { organizationId },
        include: { uploadedBy: { select: { email: true, name: true } }, usages: { where: { active: true }, take: 3 } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      tx.mediaAsset.groupBy({ by: ["purpose", "status"], where: { organizationId }, _count: { _all: true } }),
    ]);
    return { assets, counts };
  });
  const config = validateMediaConfiguration();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">Media assets</p>
            <h1 className="mt-2 text-3xl font-semibold">Asset library</h1>
            <p className="mt-2 text-sm text-text-2">Provider: {config.provider}. Local ready: {config.localReady ? "YES" : "NO"}. S3 ready: {config.cloudflareReady ? "YES" : "NO"}.</p>
          </div>
          <Link href="/media/upload" className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Upload media</Link>
        </div>

        <section className="mt-8 grid gap-3 md:grid-cols-4">
          {counts.map((row) => <div className="rounded-lg border border-line bg-ink-800 p-4" key={`${row.purpose}-${row.status}`}>
            <p className="text-xs text-text-3">{row.purpose}</p>
            <p className="mt-1 text-sm text-text-1">{row.status}</p>
            <p className="mt-2 text-2xl font-semibold text-brand-300">{row._count._all}</p>
          </div>)}
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-text-3">
              <tr><th className="p-4">Asset</th><th className="p-4">Purpose</th><th className="p-4">Status</th><th className="p-4">Visibility</th><th className="p-4">Usage</th><th className="p-4">Uploaded</th></tr>
            </thead>
            <tbody>
              {assets.map((asset) => <tr className="border-t border-line" key={asset.id}>
                <td className="p-4"><Link className="text-brand-300" href={`/media/${asset.id}`}>{asset.title || asset.originalFilename || asset.id}</Link><p className="text-xs text-text-3">{asset.mimeType} | {asset.byteSize} bytes</p></td>
                <td className="p-4">{asset.purpose}</td>
                <td className="p-4">{asset.status}</td>
                <td className="p-4">{asset.visibility}</td>
                <td className="p-4">{asset.usages.map((usage) => `${usage.entityType}:${usage.entityId}`).join(", ") || "-"}</td>
                <td className="p-4 text-text-2">{asset.uploadedBy.email}<br />{asset.createdAt.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </section>
      </main>
    </OperationsShell>
  );
}
