import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { approveAsset, archiveAsset, assignPrimaryAsset } from "@/app/media/actions";
import { OperationsShell } from "@/app/components/operations-shell";
import { MediaAssetPurpose } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function MediaDetailPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const rawSession = await auth();
  if (!rawSession?.user) redirect(`/login?callbackUrl=/media/${assetId}`);
  const { session, organizationId } = await requirePermissionWithOrganization("media:read");
  const asset = await withOrganizationContext(organizationId, (tx) => tx.mediaAsset.findUnique({
    where: { id: assetId, organizationId },
    include: {
      uploadedBy: { select: { email: true, name: true } },
      usages: { orderBy: { assignedAt: "desc" } },
      variants: { orderBy: { name: "asc" } },
    },
  }));
  if (!asset) notFound();
  const previewUrl = asset.publicUrl ?? `/media/assets/${asset.id}/file`;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/media" className="text-sm text-zinc-400">Back to media</Link>
        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={asset.altText ?? asset.title ?? "Media asset"} className="h-72 w-full object-contain" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[.2em] text-emerald-400">{asset.purpose}</p>
              <h1 className="mt-2 text-3xl font-semibold">{asset.title || asset.originalFilename || asset.id}</h1>
              <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
                <p>Status: <b>{asset.status}</b></p>
                <p>Visibility: <b>{asset.visibility}</b></p>
                <p>Provider: <b>{asset.storageProvider}</b></p>
                <p>Size: <b>{asset.byteSize} bytes</b></p>
                <p>Dimensions: <b>{asset.width ?? "-"} x {asset.height ?? "-"}</b></p>
                <p>Uploaded by: <b>{asset.uploadedBy.email}</b></p>
              </div>
              <p className="mt-4 break-all text-xs text-zinc-500">Checksum: {asset.checksumSha256}</p>
              <div className="mt-5 flex gap-3">
                <form action={approveAsset.bind(null, asset.id)}><button className="rounded-xl border border-white/10 px-4 py-2 text-sm">Approve</button></form>
                <form action={archiveAsset.bind(null, asset.id)}><button className="rounded-xl border border-rose-400/20 px-4 py-2 text-sm text-rose-300">Archive</button></form>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h2 className="text-xl font-semibold">Assign primary asset</h2>
          <form action={assignPrimaryAsset.bind(null, asset.id)} className="mt-4 grid gap-3 md:grid-cols-4">
            <select className="rounded-xl border border-white/10 bg-[#050807] p-3" name="entityType">
              <option value="Club">Club</option>
              <option value="Athlete">Athlete</option>
              <option value="Staff">Staff</option>
            </select>
            <input className="rounded-xl border border-white/10 bg-[#050807] p-3" name="entityId" placeholder="Entity ID" required />
            <select className="rounded-xl border border-white/10 bg-[#050807] p-3" name="purpose" defaultValue={asset.purpose}>
              {Object.values(MediaAssetPurpose).map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
            </select>
            <button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Assign primary</button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Panel title="Variants">{asset.variants.map((variant) => <p className="text-sm text-zinc-400" key={variant.id}>{variant.name}: {variant.width ?? "-"} x {variant.height ?? "-"} | {variant.byteSize} bytes</p>)}</Panel>
          <Panel title="Usage">{asset.usages.map((usage) => <p className="text-sm text-zinc-400" key={usage.id}>{usage.entityType}:{usage.entityId} | {usage.purpose} | {usage.active ? "active" : "inactive"}</p>)}</Panel>
        </section>
      </main>
    </OperationsShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"><h2 className="font-semibold">{title}</h2><div className="mt-4 space-y-2">{children}</div></div>;
}
