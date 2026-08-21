"use client";

import { useActionState } from "react";
import { applyCoachPhotoImport, previewCoachPhotoImport, type CoachPhotoImportState } from "@/app/coaches/actions";

export function CoachPhotoImportForm() {
  const [previewState, previewAction, previewPending] = useActionState<CoachPhotoImportState, FormData>(previewCoachPhotoImport, {});
  const [applyState, applyAction, applyPending] = useActionState<CoachPhotoImportState, FormData>(applyCoachPhotoImport, {});
  const preview = previewState.preview;
  const apply = applyState.apply;

  return (
    <div className="space-y-6">
      <form action={previewAction} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
        {previewState.error ? <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{previewState.error}</p> : null}
        <label className="block text-sm text-zinc-300">
          Coach photo files
          <input accept="image/jpeg,image/png,image/webp" className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" multiple name="files" required type="file" />
        </label>
        <p className="mt-3 text-xs text-zinc-500">Use filenames like UBS-000001.jpg, UBS-000002.png, or UBS-000003.webp. Preview validates image signatures and reports conflicts before any replacement is allowed.</p>
        <button className="mt-5 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={previewPending}>{previewPending ? "Checking..." : "Preview import"}</button>
      </form>

      {preview ? (
        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Matched Ultra Staff IDs" items={preview.matchedStaff} />
          <Panel title="Safe new photos" items={preview.safeNewPhotos} />
          <Panel title="Safe replacements" items={preview.safeReplacements} />
          <Panel title="Existing photo conflicts" items={preview.existingPhotoConflicts} />
          <Panel title="Unmatched files" items={preview.unmatchedFiles} />
          <Panel title="Duplicate staff IDs" items={preview.duplicateStaffIds} />
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:col-span-2">
            <h2 className="font-semibold">Invalid files</h2>
            <div className="mt-3 space-y-2 text-sm text-zinc-400">
              {preview.invalidFiles.map((item) => <p key={`${item.fileName}-${item.reason}`}>{item.fileName}: {item.reason}</p>)}
              {preview.invalidFiles.length === 0 ? <p>-</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      <form action={applyAction} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
        {applyState.error ? <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{applyState.error}</p> : null}
        <h2 className="font-semibold">Apply import</h2>
        <p className="mt-2 text-sm text-zinc-400">Re-select the same files to apply. Files scanned in preview are not retained between requests.</p>
        <label className="mt-4 block text-sm text-zinc-300">
          Coach photo files
          <input accept="image/jpeg,image/png,image/webp" className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" multiple name="files" required type="file" />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input className="h-4 w-4 rounded border-white/10 bg-[#050807]" name="allowReplacements" type="checkbox" />
          Allow replacing coaches who already have a photo
        </label>
        <button className="mt-5 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={applyPending}>{applyPending ? "Applying..." : "Apply import"}</button>
      </form>

      {apply ? (
        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Applied" items={apply.applied} />
          <Panel title="Skipped: conflicts (replacement not allowed)" items={apply.skippedConflicts} />
          <Panel title="Skipped: invalid or duplicate" items={apply.skippedInvalid} />
          <Panel title="Skipped: unmatched" items={apply.skippedUnmatched} />
        </section>
      ) : null}
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-1 text-sm text-zinc-400">
        {items.map((item) => <p key={item}>{item}</p>)}
        {items.length === 0 ? <p>-</p> : null}
      </div>
    </div>
  );
}
