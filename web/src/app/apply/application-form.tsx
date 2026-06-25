"use client";

import { useActionState } from "react";
import { submitApplication, type ApplicationFormState } from "@/app/apply/actions";
import type { ApplicationConfig } from "@/app/apply/application-config";

type ApplicationFormProps = {
  config: ApplicationConfig;
};

const initialState: ApplicationFormState = {};

export function ApplicationForm({ config }: ApplicationFormProps) {
  const [state, action, pending] = useActionState(submitApplication, initialState);

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
          Application submitted
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Review pending</h2>
        <p className="mt-3 text-sm text-zinc-300">
          Your application has been received. League operators will review it before any
          operational access or role is granted.
        </p>
        <p className="mt-4 font-mono text-xs text-zinc-500">
          Reference: {state.applicationId}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5 rounded-2xl border border-white/[0.08] bg-[#0b100e] p-6">
      <input name="type" type="hidden" value={config.type} />
      {state.error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {state.error}
        </div>
      ) : null}
      {config.fields.map((field) => {
        const id = `${config.type}-${field.name}`;
        const error = state.fieldErrors?.[field.name]?.[0];
        const label = field.required ? `${field.label}**` : field.label;
        if (field.type === "textarea") {
          return (
            <div key={field.name}>
              <label className="text-sm font-medium text-zinc-200" htmlFor={id}>
                {label}
              </label>
              {field.description ? (
                <p className="mt-1 text-xs leading-5 text-zinc-500">{field.description}</p>
              ) : null}
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none transition focus:border-emerald-400"
                id={id}
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
              />
              {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
            </div>
          );
        }

        if (field.type === "checkbox") {
          return (
            <div key={field.name}>
              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-200">
                <input
                  className="mt-1"
                  name={field.name}
                  required={field.required}
                  type="checkbox"
                />
                <span>{field.label}</span>
              </label>
              {field.description ? (
                <p className="mt-1 text-xs leading-5 text-zinc-500">{field.description}</p>
              ) : null}
              {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
            </div>
          );
        }

        if (field.type === "select") {
          return (
            <div key={field.name}>
              <label className="text-sm font-medium text-zinc-200" htmlFor={id}>
                {label}
              </label>
              {field.description ? (
                <p className="mt-1 text-xs leading-5 text-zinc-500">{field.description}</p>
              ) : null}
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none transition focus:border-emerald-400"
                id={id}
                name={field.name}
                required={field.required}
              >
                <option value="">Select {field.label.toLowerCase()}</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
            </div>
          );
        }

        return (
          <div key={field.name}>
            <label className="text-sm font-medium text-zinc-200" htmlFor={id}>
              {label}
            </label>
            {field.description ? (
              <p className="mt-1 text-xs leading-5 text-zinc-500">{field.description}</p>
            ) : null}
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none transition focus:border-emerald-400"
              id={id}
              name={field.name}
              placeholder={field.placeholder}
              required={field.required}
              step={field.type === "number" ? "0.01" : undefined}
              type={field.type ?? "text"}
            />
            {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
          </div>
        );
      })}
      <button
        className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Submitting..." : "Submit application"}
      </button>
      <p className="text-xs text-zinc-500">
        Submission does not grant coach, scout, official, media, vendor, or volunteer
        access. Access is granted only after admin review.
      </p>
    </form>
  );
}
