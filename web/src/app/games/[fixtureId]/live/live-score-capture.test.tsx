// A5 Step 8's wiring proof, in the same jsdom style as sync-status-badge.test.tsx (see that file's
// header for why the imports are ordered this way: jsdom globals and fake-indexeddb must be installed
// before Dexie/React are imported, so everything jsdom-dependent is imported dynamically below).
//
// What this test is actually for: the offline path's whole value is that a tap reaches IndexedDB
// WHILE THE NETWORK IS DOWN - something no service-layer test can observe, because the branch is
// `navigator.onLine` inside a React click handler. It asserts the queue record and the operator-
// visible acknowledgment, and it asserts the online path still calls the server action instead
// (a component that quietly queued while online would sync correctly but show a stale scoreboard for
// the rest of the game).
import assert from "node:assert/strict";
import test from "node:test";
import globalJsdom from "global-jsdom";
import "fake-indexeddb/auto";

globalJsdom(undefined, { url: "http://localhost/" });
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForRender(
  act: (fn: () => void | Promise<void>) => void | Promise<void>,
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitForRender: condition never became true within ${timeoutMs}ms`);
    await act(flushMicrotasks);
  }
}

function setOnline(value: boolean): void {
  // Two different `navigator` objects can be in play: jsdom's (window.navigator) and, on Node 21+,
  // Node's own global `navigator`. The component reads the bare global, global-jsdom installs its
  // window onto globalThis, and which object that resolves to is Node-version dependent - so set it
  // on both rather than assuming. (Found the hard way: with only window.navigator patched, the
  // online test took the offline branch and never called the action.)
  for (const target of new Set([window.navigator, globalThis.navigator])) {
    Object.defineProperty(target, "onLine", { value, configurable: true });
  }
}

const GAME_ID = "cmvtestgame0001";
const FIXTURE_ID = "cmvtestfixture0001";
const HOME_SC = "cmvtestsc0001home";
const PLAYER_ID = "cmvtestplayer0001";

const GAME_STATE = {
  status: "LIVE" as const,
  currentPeriod: 2,
  // Legacy defaults: period 2 with <=60s left is Ultra Time at 2x. clockStartedAt null keeps the
  // remaining seconds deterministic (no wall-clock race in the assertion), which is what lets this
  // test pin "2 points in, 4 queued" exactly.
  clockSecondsRemaining: 45,
  clockStartedAt: null,
  shotClockSecondsRemaining: 20,
  shotClockStartedAt: null,
  isUltraTimeActive: true,
};

const RULES = {
  fourPointEnabled: true,
  fourPointBaseValue: 4,
  ultraTimeEnabled: true,
  ultraTimeMultiplier: 2,
  ultraTimeStartRemainingSeconds: 60,
  ultraTimeAppliesFinalPeriodOnly: true,
  periodCount: 2,
};

const PROPS = {
  gameId: GAME_ID,
  fixtureId: FIXTURE_ID,
  organizationId: "cmvtestorg0001",
  team: { id: HOME_SC, name: "Home", players: [{ id: PLAYER_ID, name: "P Home" }] },
  rules: RULES,
  game: GAME_STATE,
  ultraTime: true,
  fourPointEnabled: true,
  offlineEnabled: true,
  action: async () => {},
};

async function main() {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { LiveScoreCapture } = await import("./live-score-capture");
  const { offlineDb } = await import("@/lib/offline/db");

  async function mount(action: (formData: FormData) => Promise<void>) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<LiveScoreCapture {...PROPS} action={action} />);
    });
    return {
      container,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((candidate) => (candidate.textContent ?? "").startsWith(text));
    assert.ok(button, `expected a button starting with "${text}"`);
    return button as HTMLButtonElement;
  }

  test.beforeEach(async () => {
    await offlineDb.outbox.clear();
    await offlineDb.games.clear();
    await offlineDb.gameEvents.clear();
  });

  test("offline + flag on: a tap is resolved client-side, queued in the outbox with clientObservedAt, and acknowledged", async () => {
    setOnline(false);
    const { container, unmount } = await mount(async () => {
      throw new Error("the server action must not be called while offline");
    });
    try {
      // The console attaches (never creates) the local game before it can queue anything - waiting for
      // that row is what proves the mount wiring ran, not just that the click handler exists.
      await waitForRender(act, async () => Boolean(await offlineDb.games.get(GAME_ID)));

      act(() => {
        buttonByText(container, "+2").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await waitForRender(act, async () => (await offlineDb.outbox.count()) === 1);

      const queued = await offlineDb.outbox.toArray();
      assert.equal(queued.length, 1);
      const record = queued[0];
      assert.equal(record.entityType, "GameEvent");
      assert.equal(record.operation, "CREATE");
      assert.equal(record.ledgerSourceHint, "SCORER");
      assert.match(record.entityId, /^[0-9a-f-]{36}$/, "the queued event id must be a UUID (outbox-schema's entityId constraint)");

      const payload = record.payload as Record<string, unknown>;
      assert.equal(payload.eventType, "SCORE");
      assert.equal(payload.basePointValue, 2);
      assert.equal(payload.multiplier, 2, "Ultra Time is resolved on the device from the attached clock anchor");
      assert.equal(payload.points, 4, "the queued delta is already multiplied - the server validates rather than re-resolves");
      assert.equal(payload.isUltraTime, true);
      assert.equal(payload.seasonClubId, HOME_SC);
      assert.equal(typeof payload.clientObservedAt, "string", "an offline tap must carry its observation timestamp");

      // The operator-visible acknowledgment: names the resolved (multiplied) value and counts the
      // queue. Matched on ASCII substrings only - the surrounding symbols are cosmetic, and asserting
      // them makes the test depend on source-file encoding rather than on behavior. The pending count
      // arrives one render later than the acknowledgment itself (useLiveQuery re-runs after the Dexie
      // write), so wait for it rather than reading the first render that shows the message.
      await waitForRender(act, () => (container.textContent ?? "").includes("Captured offline"));
      assert.match(container.textContent ?? "", /Captured offline: \+2/);
      assert.match(container.textContent ?? "", /= 4 \(Ultra Time\)/);
      await waitForRender(act, () => (container.textContent ?? "").includes("1 pending"));
    } finally {
      unmount();
    }
  });

  test("online: the same tap calls the server action with the form fields and queues nothing locally", async () => {
    setOnline(true);
    const calls: FormData[] = [];
    const { container, unmount } = await mount(async (formData) => {
      calls.push(formData);
    });
    try {
      act(() => {
        buttonByText(container, "+3").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await waitForRender(act, () => calls.length > 0);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].get("seasonClubId"), HOME_SC);
      assert.equal(calls[0].get("points"), "3");
      assert.equal(calls[0].get("playerId"), "", "no player selected means a team score, exactly as the form defaulted to");
      assert.equal(await offlineDb.outbox.count(), 0, "the online path must not queue anything");
    } finally {
      unmount();
    }
  });

  test("flag off: behaves exactly like the form it replaced - server action only, no local queue, no offline copy", async () => {
    setOnline(false);
    const calls: FormData[] = [];
    const { container, unmount } = await mount(async (formData) => {
      calls.push(formData);
    });
    try {
      // Re-render with the flag off (the prop is what the server component derives from the env var).
      const root = container.firstChild;
      void root;
      // Mount a second instance with offlineEnabled false rather than mutating the first: props are
      // owned by the server component in production, so flipping them mid-life is not a real state.
      const { offlineEnabled: _ignored, ...rest } = PROPS;
      void _ignored;
      const other = document.createElement("div");
      document.body.appendChild(other);
      const otherRoot = createRoot(other);
      await act(async () => {
        otherRoot.render(<LiveScoreCapture {...rest} offlineEnabled={false} action={async (formData) => void calls.push(formData)} />);
      });
      try {
        act(() => {
          buttonByText(other, "+1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await waitForRender(act, () => calls.length > 0);
        assert.equal(calls.length, 1, "with the flag off an offline device still submits (and fails) like before - no silent local queue");
        assert.equal(await offlineDb.outbox.count(), 0);
        assert.equal((other.textContent ?? "").includes("Captured offline"), false);
      } finally {
        act(() => otherRoot.unmount());
        other.remove();
      }
    } finally {
      unmount();
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
