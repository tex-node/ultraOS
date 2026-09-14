"use client";

import { useActionState } from "react";
import { clearSportOverride, saveSportOverride, type SportRulesFormState } from "./actions";

type RuleField = {
  key: string;
  label: string;
  value: number | string | boolean;
  valueType: "number" | "string" | "boolean";
};

const inputClass = "mt-1 w-full rounded-lg border border-white/10 bg-[#050807] px-3 py-2 text-sm text-white";
const labelClass = "block text-sm text-zinc-300";

export function SportRulesForm({
  competitionId,
  sportId,
  sportName,
  rules,
  defaultDivisions,
  hasOverride,
}: {
  competitionId: string;
  sportId: string;
  sportName: string;
  rules: RuleField[];
  defaultDivisions: string;
  hasOverride: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState<SportRulesFormState, FormData>(saveSportOverride, {});
  const [clearState, clearAction, clearing] = useActionState<SportRulesFormState, FormData>(clearSportOverride, {});

  const error = saveState.error ?? clearState.error;
  const saved = (saveState.saved || clearState.saved) && !error;

  return (
    <div className="mt-6 grid gap-6">
      <form action={saveAction} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
        <input type="hidden" name="sportId" value={sportId} />
        <input type="hidden" name="competitionId" value={competitionId} />

        {rules.length === 0 ? (
          <p className="text-sm text-zinc-400">This sport has no customizable rules.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map((rule) => (
              <label key={rule.key} className={labelClass}>
                {rule.label}
                {rule.valueType === "boolean" ? (
                  <select name={`rule:${rule.key}`} defaultValue={String(rule.value)} className={inputClass}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : rule.valueType === "number" ? (
                  <input
                    name={`rule:${rule.key}`}
                    type="number"
                    step="any"
                    defaultValue={String(rule.value)}
                    className={inputClass}
                  />
                ) : (
                  <input name={`rule:${rule.key}`} defaultValue={String(rule.value)} className={inputClass} />
                )}
              </label>
            ))}
          </div>
        )}

        <label className={`${labelClass} mt-4`}>
          Default divisions (comma-separated)
          <input name="defaultDivisions" defaultValue={defaultDivisions} className={inputClass} />
        </label>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Saved. New values apply to {sportName} competitions in your organization.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="mt-4 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
      </form>

      {hasOverride ? (
        <form action={clearAction} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <input type="hidden" name="sportId" value={sportId} />
          <input type="hidden" name="competitionId" value={competitionId} />
          <p className="text-sm text-zinc-300">
            This organization has customized {sportName} rules. Resetting restores the built-in defaults.
          </p>
          <button
            type="submit"
            disabled={clearing}
            className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:border-white/30 disabled:opacity-60"
          >
            {clearing ? "Resetting…" : `Reset to default ${sportName} rules`}
          </button>
        </form>
      ) : null}
    </div>
  );
}
