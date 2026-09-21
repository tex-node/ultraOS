import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { uploadMedia } from "@/app/media/actions";
import { MediaAssetPurpose, MediaVisibility } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";

export default async function MediaUploadPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/media/upload");
  const session = await requirePermission("media:upload");
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Upload</p>
        <h1 className="mt-2 text-3xl font-semibold">Upload media asset</h1>
        <form action={uploadMedia} className="mt-8 space-y-5 rounded-lg border border-line bg-ink-800 p-6">
          <label className="block text-sm">File
            <input className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <label className="block text-sm">Purpose
            <select className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="purpose" defaultValue={MediaAssetPurpose.CONTENT_ASSET}>
              {Object.values(MediaAssetPurpose).map((purpose) => <option key={purpose} value={purpose}>{purpose.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="block text-sm">Visibility
            <select className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="visibility" defaultValue={MediaVisibility.PRIVATE}>
              {Object.values(MediaVisibility).map((visibility) => <option key={visibility} value={visibility}>{visibility}</option>)}
            </select>
          </label>
          <label className="block text-sm">Title<input className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="title" /></label>
          <label className="block text-sm">Alt text<input className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="altText" /></label>
          <label className="block text-sm">Caption<textarea className="mt-2 w-full rounded-md border border-line bg-ink-900 p-3" name="caption" /></label>
          <p className="text-xs text-text-3">Accepted: JPG, PNG, WebP. SVG is rejected until a sanitizer is available.</p>
          <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Upload</button>
        </form>
      </main>
    </OperationsShell>
  );
}
