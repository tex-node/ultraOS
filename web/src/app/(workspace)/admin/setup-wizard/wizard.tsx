"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createLeagueAction, type SetupWizardResult } from "./actions";

// The five-step onboarding wizard (streak v15, Prompt 3).
//
// The steps exist to keep the submit honest: each one validates what it owns, and the final button sends ONE form to
// ONE server action that writes the whole league in one transaction. Nothing is persisted until step 5, so abandoning
// the wizard leaves no half-built league behind.
const SPORTS = [
  { slug: "basketball", label: "Basketball", individual: false },
  { slug: "football", label: "Football", individual: false },
  { slug: "volleyball", label: "Volleyball", individual: false },
  { slug: "cricket", label: "Cricket", individual: false },
  { slug: "american-football", label: "American Football", individual: false },
  { slug: "baseball", label: "Baseball", individual: false },
  { slug: "tennis", label: "Tennis", individual: true },
  { slug: "table-tennis", label: "Table Tennis", individual: true },
];

export function SetupWizard({ canCreateOrganization }: { canCreateOrganization: boolean }) {
  const [step, setStep] = useState(1);
  const [sport, setSport] = useState(SPORTS[0]);
  const [competitionName, setCompetitionName] = useState("");
  const [participants, setParticipants] = useState("");
  const [format, setFormat] = useState<"ROUND_ROBIN" | "KNOCKOUT">("ROUND_ROBIN");
  const [gamesPerPairing, setGamesPerPairing] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [newOrganizationSlug, setNewOrganizationSlug] = useState("");
  const [result, action, pending] = useActionState<SetupWizardResult | null, FormData>(createLeagueAction, null);

  const names = participants.split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean);
  const canAdvance =
    step === 1 ? Boolean(sport) :
    step === 2 ? competitionName.trim().length >= 3 :
    step === 3 ? names.length >= 2 :
    step === 4 ? Boolean(format) : true;

  return (
    <div className="rounded-lg border border-line bg-ink-800 p-5">
      <ol className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
        {["Sport", "League", "Participants", "Format", "Generate"].map((label, index) => (
          <li key={label} className={`rounded-full border px-2 py-0.5 ${step === index + 1 ? "border-brand-400/60 text-brand-300" : "border-line text-text-3"}`}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <form action={action} className="mt-4 space-y-4">
        {/* The inputs are always mounted, hidden when their step is not current, so the single submit carries them all. */}
        <div hidden={step !== 1}>
          <label className="text-xs text-text-3">Sport</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            {SPORTS.map((option) => (
              <button
                type="button"
                key={option.slug}
                onClick={() => setSport(option)}
                className={`rounded-lg border px-3 py-2 text-sm ${sport.slug === option.slug ? "border-brand-400/60 text-brand-300" : "border-line text-text-2"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="sportSlug" value={sport.slug} />
        </div>

        <div hidden={step !== 2} className="space-y-3">
          <label className="block text-xs text-text-3">
            Competition name
            <input
              name="competitionName"
              value={competitionName}
              onChange={(event) => setCompetitionName(event.target.value)}
              placeholder="Lagos Basketball League"
              className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1"
            />
          </label>
          {canCreateOrganization ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-text-3">
                New organization name (optional)
                <input
                  name="newOrganizationName"
                  value={newOrganizationName}
                  onChange={(event) => setNewOrganizationName(event.target.value)}
                  placeholder="Leave blank to use this league"
                  className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1"
                />
              </label>
              <label className="block text-xs text-text-3">
                New organization slug (optional)
                <input
                  name="newOrganizationSlug"
                  value={newOrganizationSlug}
                  onChange={(event) => setNewOrganizationSlug(event.target.value)}
                  placeholder="lagos-basketball"
                  className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 text-sm text-text-1"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div hidden={step !== 3}>
          <label className="block text-xs text-text-3">
            {sport.individual ? "Entrants (one per line)" : "Teams (one per line)"}
            <textarea
              name="participants"
              value={participants}
              onChange={(event) => setParticipants(event.target.value)}
              rows={7}
              placeholder={"Team A\nTeam B\nTeam C"}
              className="mt-1 w-full rounded border border-line bg-ink-900 px-3 py-2 font-mono text-sm text-text-1"
            />
          </label>
          <p className="mt-1 text-xs text-text-3">{names.length} entered{sport.individual ? " (individual sport)" : " (team sport — clubs are created for you)"}</p>
        </div>

        <div hidden={step !== 4} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["ROUND_ROBIN", "KNOCKOUT"] as const).map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setFormat(option)}
                className={`rounded-lg border px-3 py-2 text-sm ${format === option ? "border-brand-400/60 text-brand-300" : "border-line text-text-2"}`}
              >
                {option === "ROUND_ROBIN" ? "Round robin" : "Knockout"}
              </button>
            ))}
          </div>
          <input type="hidden" name="format" value={format} />
          {format === "ROUND_ROBIN" ? (
            <label className="block text-xs text-text-3">
              Games per pairing
              <select
                name="gamesPerPairing"
                value={gamesPerPairing}
                onChange={(event) => setGamesPerPairing(Number(event.target.value))}
                className="ml-2 rounded border border-line bg-ink-900 px-2 py-1 text-sm text-text-1"
              >
                <option value={1}>Once (single round robin)</option>
                <option value={2}>Home and away (double)</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="gamesPerPairing" value={1} />
          )}
          <label className="block text-xs text-text-3">
            First match day
            <input
              type="date"
              name="startDate"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="ml-2 rounded border border-line bg-ink-900 px-2 py-1 text-sm text-text-1"
            />
          </label>
        </div>

        <div hidden={step !== 5}>
          <p className="text-sm text-text-2">
            Create <b className="text-text-1">{competitionName || "the competition"}</b> with{" "}
            <b className="text-text-1">{names.length}</b> {sport.individual ? "entrants" : "teams"}, as a{" "}
            {format === "ROUND_ROBIN" ? `round robin${gamesPerPairing === 2 ? " (home and away)" : ""}` : "knockout"}, starting{" "}
            {startDate}.
          </p>
          <p className="mt-1 text-xs text-text-3">Everything below is written in one transaction: a failure leaves nothing behind.</p>
          <button
            type="submit"
            disabled={pending || names.length < 2 || competitionName.trim().length < 3}
            className="mt-3 rounded-lg bg-brand-400 px-4 py-2 text-sm font-bold text-ink-900 disabled:opacity-40"
          >
            {pending ? "Creating…" : "Create league"}
          </button>
        </div>

        {result && !result.ok ? <p className="text-xs text-danger">{result.error}</p> : null}
        {result && result.ok ? (
          <p className="text-sm text-brand-300">
            Created {result.participants} participants and {result.fixtures} fixtures.{" "}
            <a className="underline" href={`/t/${result.organizationSlug}/${result.slug}`}>Open the tournament site</a>
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="rounded-lg border border-line px-3 py-1.5 text-xs text-text-2 disabled:opacity-40">
            Back
          </button>
          {step < 5 ? (
            <button type="button" onClick={() => setStep((current) => Math.min(5, current + 1))} disabled={!canAdvance} className="rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs font-bold text-brand-300 disabled:opacity-40">
              Next
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
