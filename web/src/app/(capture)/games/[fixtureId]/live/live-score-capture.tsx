"use client";

// A5 Step 8: the live console's scoring buttons, converted from plain form submits into a component
// that can capture a tap locally when the tablet has lost the network.
//
// Two paths, one markup tree, so the operator's buttons never move or change shape mid-game:
//   - online (or offline scoring not enabled): the tap submits the existing `recordScore` server
//     action, exactly as the form did before this component existed.
//   - offline, with the flag on: the tap is resolved client-side (resolveClientShot), written to
//     IndexedDB through LocalScoringRepository, and queued in the outbox with clientObservedAt. The
//     queue drains on the next online/visibilitychange trigger (startAutoSync, already wired in A4),
//     and the server replays it through the SAME effects a live tap uses (A5 Step 7).
//
// The chosen local-only design decisions worth knowing before editing this file:
//   - The local game row is ATTACHED, not created (attachServerGame) - creating it would enqueue a
//     Game:CREATE that can only ever fail on Game.fixtureId's unique constraint.
//   - The displayed score does not move while offline: there is no local score projection yet, and
//     replay recomputes before/after from the server's own fixture row. The queue acknowledgment below
//     is therefore the operator's only feedback that the tap landed - which is exactly why it exists.
//   - A failed capture is shown inline, not swallowed: a tap that did not reach IndexedDB is a lost
//     point, and the scorekeeper needs to know immediately rather than at half-time.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import { getOrCreateDeviceId } from "@/lib/offline/device-id";
import { startAutoSync } from "@/lib/offline/auto-sync";
import { LocalScoringRepository } from "@/lib/offline/repositories/scoringRepository";
import { captureScoreTap } from "@/lib/offline/score-capture";
import type { RuleSnapshotForScoring } from "@/lib/ultra-scoring-engine";

const BIG_BTN = "min-h-[56px] min-w-[56px] rounded-md px-4 font-display text-base font-bold active:scale-95 transition";

const emptySubscribe = () => () => {};
function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Server snapshot is `true` (online) so SSR never renders the offline capture affordances - the real
// value arrives on the client's first paint.
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export interface LiveScoreCaptureGame {
  status: "NOT_STARTED" | "LIVE" | "PAUSED" | "FINAL";
  currentPeriod: number;
  clockSecondsRemaining: number;
  clockStartedAt: string | null;
  shotClockSecondsRemaining: number;
  shotClockStartedAt: string | null;
  isUltraTimeActive: boolean;
}

export interface LiveScoreCaptureProps {
  gameId: string;
  fixtureId: string;
  organizationId: string;
  team: { id: string; name: string; players: { id: string; name: string }[] };
  rules: RuleSnapshotForScoring;
  game: LiveScoreCaptureGame;
  ultraTime: boolean;
  fourPointEnabled: boolean;
  offlineEnabled: boolean;
  // The bound `recordScore` server action. Calling a server action from a click handler is supported;
  // passing it as a prop is what keeps this component out of a "use server" file's export surface.
  action: (formData: FormData) => Promise<void>;
}

type Acknowledgment = { kind: "queued"; message: string } | { kind: "error"; message: string };

export function LiveScoreCapture({
  gameId,
  fixtureId,
  organizationId,
  team,
  rules,
  game,
  ultraTime,
  fourPointEnabled,
  offlineEnabled,
  action,
}: LiveScoreCaptureProps) {
  const mounted = useIsMounted();
  const online = useOnline();
  const [isPending, startTransition] = useTransition();
  const [playerId, setPlayerId] = useState("");
  const [description, setDescription] = useState("");
  const [ack, setAck] = useState<Acknowledgment | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const offlineMode = offlineEnabled && !online && mounted;

  // The queue count is the offline path's only durable feedback: it keeps climbing while taps are
  // being captured and stops once drain() has accepted the batch.
  const pending = useLiveQuery(
    () => (mounted && offlineEnabled ? offlineDb.outbox.filter((r) => !r.syncedAt && !r.deadLetteredAt).count() : 0),
    [mounted, offlineEnabled],
    null,
  );

  // Attach (never create) the local mirror of this game, then keep it in step with the server's clock
  // anchor. Re-runs whenever the server re-renders the console with new state (pause/resume/period),
  // which is what keeps an offline tap's Ultra Time resolution honest.
  useEffect(() => {
    if (!offlineEnabled || !mounted) return;
    void (async () => {
      try {
        const repo = new LocalScoringRepository(offlineDb, deviceIdRef.current ?? getOrCreateDeviceId());
        await repo.attachServerGame({
          id: gameId,
          organizationId,
          fixtureId,
          status: game.status,
          currentPeriod: game.currentPeriod,
          clockSecondsRemaining: game.clockSecondsRemaining,
          clockStartedAt: game.clockStartedAt,
          shotClockSecondsRemaining: game.shotClockSecondsRemaining,
          shotClockStartedAt: game.shotClockStartedAt,
          isUltraTimeActive: game.isUltraTimeActive,
        });
      } catch {
        // A local-DB failure (private mode, storage quota) must not break the online console - the
        // online path still works, and offline taps will fail loudly with LOCAL_GAME_NOT_ATTACHED.
      }
    })();
  }, [
    offlineEnabled,
    mounted,
    gameId,
    organizationId,
    fixtureId,
    game.status,
    game.currentPeriod,
    game.clockSecondsRemaining,
    game.clockStartedAt,
    game.shotClockSecondsRemaining,
    game.shotClockStartedAt,
    game.isUltraTimeActive,
  ]);

  // Same drain wiring the sync badge uses: one registration per mount, every trigger fires drain().
  useEffect(() => {
    if (!offlineEnabled || !mounted) return;
    const deviceId = deviceIdRef.current ?? getOrCreateDeviceId();
    return startAutoSync(deviceId);
  }, [offlineEnabled, mounted]);

  const handleTap = useCallback(
    (shotValue: number) => {
      const formData = new FormData();
      formData.set("seasonClubId", team.id);
      formData.set("playerId", playerId);
      formData.set("points", String(shotValue));
      formData.set("description", description);

      if (!offlineMode) {
        // Online: identical to the form submission this component replaced.
        startTransition(async () => {
          await action(formData);
        });
        return;
      }

      void (async () => {
        try {
          const repo = new LocalScoringRepository(offlineDb, deviceIdRef.current ?? getOrCreateDeviceId());
          const captured = await captureScoreTap(repo, gameId, {
            seasonClubId: team.id,
            playerId: playerId || null,
            shotValue,
            description,
            rules,
          });
          const scoring = captured.isUltraTime
            ? `${captured.basePointValue}Ã—${captured.multiplier} = ${captured.points} (Ultra Time)`
            : `${captured.points}`;
          setAck({ kind: "queued", message: `âœ“ Captured offline: +${scoring} â€” queued for sync` });
        } catch (error) {
          setAck({
            kind: "error",
            message: `âœ• Not captured: ${error instanceof Error ? error.message : String(error)} â€” the tap did NOT reach the queue.`,
          });
        }
      })();
    },
    [action, description, gameId, offlineMode, playerId, rules, team.id],
  );

  const actionButtons = (values: number[], className: (value: number) => string, label: (value: number) => ReactNode) => (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => handleTap(value)}
          className={className(value)}
          disabled={game.status === "FINAL" || isPending}
        >
          {label(value)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mt-4">
      <label className="sr-only" htmlFor={`player-${team.id}`}>
        Player
      </label>
      <select
        id={`player-${team.id}`}
        value={playerId}
        onChange={(event) => setPlayerId(event.target.value)}
        className="min-h-[48px] w-full rounded-lg bg-white/[.05] p-3"
      >
        <option value="">Team score / unknown player</option>
        {team.players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
      </select>

      {actionButtons(
        [1, 2, 3],
        () => `${BIG_BTN} bg-brand-400 text-ink-900`,
        (value) => (
          <>
            +{value}
            {ultraTime ? <span className="block text-[10px] font-normal">â†’ {value * 2}</span> : null}
          </>
        ),
      )}
      {/* 4PT keeps its violet identity from the pre-conversion form: it is Ultra's own shot type, not
          "just another number" next to 1/2/3. Hidden when the format in play has no four-point shot. */}
      {fourPointEnabled ? (
        <div className="mt-2 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleTap(4)}
            disabled={game.status === "FINAL" || isPending}
            className={`${BIG_BTN} border-2 border-violet-300 bg-accent-purple text-white shadow-[0_0_12px_rgba(167,139,250,0.5)]`}
          >
            4PT{ultraTime ? <span className="block text-[10px] font-normal">â†’ 8</span> : null}
          </button>
        </div>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-text-3">Manual correction (prefer Undo last event above)</summary>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[-1, -2, -3, -4].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTap(value)}
              disabled={game.status === "FINAL" || isPending}
              className={`${BIG_BTN} border border-rose-400/20 text-danger`}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Reason for manual correction"
          className="mt-2 min-h-[44px] w-full rounded-lg bg-white/[.05] p-3 text-sm"
        />
      </details>

      {/* Acknowledgment: queued (amber, counts the queue) or not-captured (red, the tap was lost). */}
      {ack ? (
        <p
          role="status"
          className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${
            ack.kind === "queued" ? "border-warn/40 bg-warn/10 text-warn" : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {ack.message}
          {ack.kind === "queued" && (pending ?? 0) > 0 ? ` Â· ${pending} pending` : null}
        </p>
      ) : offlineMode ? (
        <p role="status" className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs font-semibold text-warn">
          OFFLINE â€” taps are captured on this device and sync when the connection returns. The scoreboard above will not
          move until then.
        </p>
      ) : null}
    </div>
  );
}
