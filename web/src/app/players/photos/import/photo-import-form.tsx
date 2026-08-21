"use client";

import { useActionState } from "react";
import { previewPlayerPhotoImport, type PlayerPhotoImportState } from "@/app/players/actions";

export function PlayerPhotoImportForm() {
  const [state, action, pending] = useActionState<PlayerPhotoImportState, FormData>(previewPlayerPhotoImport, {});
  const preview = state.preview;

  return (
    <div className="space-y-6">
      <form action={action} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
        {state.error ? <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{state.error}</p> : null}
        <label className="block text-sm text-zinc-300">
          Player photo files
          <input accept="image/jpeg,image/png,image/webp" className="mt-2 w-full rounded-xl border border-white/10 bg-[#050807] p-3" multiple name="files" required type="file" />
        </label>
        <p className="mt-3 text-xs text-zinc-500">Use filenames like UBA-000001.jpg, UBA-000002.png, or UBA-000003.webp. Preview validates image signatures and reports conflicts before any replacement is allowed.</p>
        <button className="mt-5 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60" disabled={pending}>{pending ? "Checking..." : "Preview import"}</button>
      </form>

      {preview ? (
        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="Matched Ultra Athlete IDs" items={preview.matchedUltraIds} />
          <Panel title="Safe replacements" items={preview.safeReplacements} />
          <Panel title="Existing photo conflicts" items={preview.existingPhotoConflicts} />
          <Panel title="Missing Players" items={preview.missingPlayers} />
          <Panel title="Duplicate files" items={preview.duplicateFiles} />
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h2 className="font-semibold">Invalid files</h2>
            <div className="mt-3 space-y-2 text-sm text-zinc-400">
              {preview.invalidFiles.map((item) => <p key={`${item.fileName}-${item.reason}`}>{item.fileName}: {item.reason}</p>)}
              {preview.invalidFiles.length === 0 ? <p>-</p> : null}
            </div>
          </div>
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
