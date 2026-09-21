"use client";

import { useEffect, useState } from "react";
import { findCheckInCode } from "./actions";

type ScanEntry = { codeSuffix: string; at: number };

const LOG_KEY = "gate-scan-log";
const LOG_LIMIT = 20;

// Gate scanner tools (F4): connectivity pill plus a per-device scan log. The log is local
// only — admission itself always verifies server-side, so entries here mean "opened for
// verification", and anything unverified must be re-scanned once back online.
function loadLog(): ScanEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as ScanEntry[]) : [];
  } catch {
    // Corrupt log — start fresh rather than crash the scanner.
    return [];
  }
}

export function GateScanTools() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [log, setLog] = useState<ScanEntry[]>(loadLog);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const record = (code: string) => {
    const entry = { codeSuffix: code.trim().slice(-6), at: Date.now() };
    setLog((previous) => {
      const next = [entry, ...previous].slice(0, LOG_LIMIT);
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(next));
      } catch {
        // Storage full or blocked — the scanner still works, just without history.
      }
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-center gap-2">
        <span
          className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider ${
            online ? "bg-brand-400/10 text-brand-400" : "bg-danger/10 text-danger"
          }`}
        >
          {online ? "Online" : "Offline — verify before admitting"}
        </span>
      </div>
      {!online ? (
        <p className="mt-3 text-center text-xs text-warn">
          No connection: codes cannot be verified right now. Re-scan anything admitted from
          memory once back online.
        </p>
      ) : null}
      <form
        action={findCheckInCode}
        className="mt-6 flex gap-2"
        onSubmit={(event) => {
          const data = new FormData(event.currentTarget);
          record(String(data.get("code") ?? ""));
        }}
      >
        <input name="code" required autoFocus placeholder="Ticket, accreditation, or collection code" className="min-w-0 flex-1 rounded-md bg-white/[.05] p-4" />
        <button className="rounded-md bg-brand-400 px-5 font-semibold text-ink-900">Find</button>
      </form>
      {log.length > 0 ? (
        <div className="mt-6 text-left">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-text-3">Recent scans on this device</p>
            <button
              type="button"
              onClick={() => {
                setLog([]);
                try {
                  localStorage.removeItem(LOG_KEY);
                } catch {
                  // Ignore — see above.
                }
              }}
              className="text-xs text-text-3 underline"
            >
              Clear
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-text-2">
            {log.slice(0, 8).map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                …{entry.codeSuffix} · {new Date(entry.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
