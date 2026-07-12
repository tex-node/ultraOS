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
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {state.error}
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
        Messages are sent by BCC so recipients cannot see each other. SMTP must be
        configured before sending works.
      </p>
    </form>
  );
}
