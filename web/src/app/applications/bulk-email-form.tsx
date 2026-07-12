"use client";

import { useActionState } from "react";
import {
  sendBulkApplicationEmail,
  type BulkEmailState,
} from "@/app/applications/actions";

const initialState: BulkEmailState = {};

const audienceOptions = [
  { label: "Players, coaches, scouts, and vendors", value: "ALL" },
  { label: "Players only", value: "PLAYER" },
  { label: "Coaches only", value: "COACH" },
  { label: "Scouts only", value: "SCOUT" },
  { label: "Vendors only", value: "VENDOR" },
];

const statusOptions = [
  { label: "All", value: "ALL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Submitted", value: "SUBMITTED" },
];

export function BulkEmailForm() {
  const [state, action, pending] = useActionState(sendBulkApplicationEmail, initialState);

  return (
    <form action={action} className="mt-5 grid gap-4">
      {state.success ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          Email sent to {state.sentCount ?? 0} recipient{state.sentCount === 1 ? "" : "s"}.
        </div>
      ) : null}
      {state.error ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          <p>{state.error}</p>
          {state.failedRecipients?.length ? (
            <div className="mt-3">
              <p className="font-semibold">Failed recipients</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-50/80">
                {state.failedRecipients.slice(0, 10).map((recipient) => (
                  <li key={recipient.email}>
                    {recipient.email}: {recipient.error}
                  </li>
                ))}
              </ul>
              {state.failedRecipients.length > 10 ? (
                <p className="mt-2 text-xs text-amber-50/70">
                  Showing 10 of {state.failedRecipients.length} failed recipients.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="grid gap-2 text-sm">
        <span className="text-zinc-300">Audience</span>
        <select
          className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 outline-none focus:border-emerald-400"
          name="types"
        >
          {audienceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm">
        <span className="text-zinc-300">Application status</span>
        <select
          className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 outline-none focus:border-emerald-400"
          name="status"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm">
        <span className="text-zinc-300">Subject</span>
        <input
          className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 outline-none focus:border-emerald-400"
          maxLength={160}
          name="subject"
          required
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="text-zinc-300">Message</span>
        <span className="text-xs leading-5 text-zinc-500">
          Use <code className="rounded bg-white/10 px-1 py-0.5 text-emerald-200">{"{{name}}"}</code>{" "}
          for the recipient&apos;s full name or{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-emerald-200">{"{{firstName}}"}</code>{" "}
          for their first name.
        </span>
        <textarea
          className="min-h-36 rounded-xl border border-white/10 bg-[#050807] px-3 py-3 outline-none focus:border-emerald-400"
          name="message"
          required
        />
      </label>
      <button
        className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending..." : "Send email"}
      </button>
      <p className="text-xs leading-5 text-zinc-500">
        Messages are sent one recipient at a time so merge tags can be personalized.
        SMTP must be configured before sending works.
      </p>
    </form>
  );
}
