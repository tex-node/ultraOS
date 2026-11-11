"use client";

import { useActionState, useState } from "react";
import type { ApiKeyRow } from "@/lib/api-v1/api-keys";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyActionState } from "./actions";

// API key console (streak v9, Prompt 2). The raw key appears ONCE, immediately after creation; the list shows
// only the prefix. Revoking is immediate - the resolver checks isActive/revokedAt on every request.

const TIERS = [
  { value: "BASIC", label: "BASIC · 60 requests/min" },
  { value: "PRO", label: "PRO · 600 requests/min · exports" },
  { value: "ENTERPRISE", label: "ENTERPRISE · 6,000 requests/min · exports" },
] as const;

export function ApiKeysManager({ keys }: { keys: ApiKeyRow[] }) {
  const [createState, createAction, creating] = useActionState(createApiKeyAction, {} as ApiKeyActionState);
  const [revokeState, revokeAction, revoking] = useActionState(revokeApiKeyAction, {} as ApiKeyActionState);
  const [showCreate, setShowCreate] = useState(keys.filter((key) => key.isActive).length === 0);
  const error = createState.error ?? revokeState.error;

  return (
    <div className="mt-6 space-y-6">
      {error ? (
        <p role="alert" className="rounded-md bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {createState.created ? (
        <div role="status" className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <p className="font-semibold">Key “{createState.created.name}” created ({createState.created.tier})</p>
          <p className="mt-1 text-xs">Copy it now — this is the only time the full key is shown. Store it in the partner&apos;s secret manager.</p>
          <code className="mt-2 block break-all rounded bg-ink-900 p-2 font-mono text-xs text-text-1">{createState.created.rawKey}</code>
        </div>
      ) : null}

      {revokeState.revoked ? (
        <p role="status" className={`rounded-md p-3 text-sm ${revokeState.revoked.ok ? "bg-brand-400/10 text-brand-300" : "bg-danger/10 text-danger"}`}>
          {revokeState.revoked.ok ? "Key revoked — it stops working immediately." : `Revoke refused: ${revokeState.revoked.error}`}
        </p>
      ) : null}

      <section className="rounded-lg border border-line bg-ink-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">API keys ({keys.filter((key) => key.isActive).length} active)</h2>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="rounded-md border border-line px-3 py-1.5 text-xs">
            {showCreate ? "Hide form" : "New key"}
          </button>
        </div>

        {showCreate ? (
          <form action={createAction} className="mt-3 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
            <label className="text-xs text-text-2">
              Name
              <input name="name" required minLength={3} maxLength={120} placeholder="Sportsbook integration" className="mt-1 min-h-[40px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
            </label>
            <label className="text-xs text-text-2">
              Tier
              <select name="tier" defaultValue="BASIC" className="mt-1 min-h-[40px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm">
                {TIERS.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={creating} className="min-h-[40px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900 disabled:opacity-40">
                {creating ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        ) : null}

        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-text-3">No keys yet. The API requires one for everything except the public scoreboard.</p>
        ) : (
          <table className="mt-3 min-w-full text-xs">
            <thead>
              <tr className="text-left text-text-3">
                <th className="p-1">Name</th>
                <th className="p-1">Prefix</th>
                <th className="p-1">Tier</th>
                <th className="p-1">Last used</th>
                <th className="p-1">Status</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-line-subtle">
                  <td className="p-1 text-text-1">{key.name}</td>
                  <td className="p-1 font-mono text-text-2">{key.prefix}…</td>
                  <td className="p-1">{key.tier}</td>
                  <td className="p-1 text-text-3">{key.lastUsedAt ? key.lastUsedAt.toISOString().slice(0, 16).replace("T", " ") : "never"}</td>
                  <td className="p-1">
                    <span className={key.isActive ? "text-brand-300" : "text-text-3"}>{key.isActive ? "ACTIVE" : "REVOKED"}</span>
                  </td>
                  <td className="p-1">
                    {key.isActive ? (
                      <form action={revokeAction}>
                        <input type="hidden" name="keyId" value={key.id} />
                        <button type="submit" disabled={revoking} className="rounded border border-danger/40 px-2 py-0.5 text-[11px] text-danger disabled:opacity-40">
                          Revoke
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-text-3">
        Send the key as <code>Authorization: Bearer &lt;key&gt;</code>. Revocation and <code>lastUsedAt</code> are
        checked per request; keys are stored as SHA-256 hashes, so a leaked database does not leak usable keys.
      </p>
    </div>
  );
}
