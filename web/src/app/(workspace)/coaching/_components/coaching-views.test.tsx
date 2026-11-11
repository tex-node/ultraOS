// Component-level (jsdom) tests for the coach-private views. Follows docs/patterns/component-testing.md:
// global-jsdom first, then every module that needs a DOM imported dynamically.
import assert from "node:assert/strict";
import test from "node:test";
import globalJsdom from "global-jsdom";

globalJsdom(undefined, { url: "http://localhost/" });
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// Node ships its own FormData, which global-jsdom leaves alone, but it cannot read a jsdom <form>.
// Real browsers have one FormData; point the global at jsdom's so React and the component agree.
(globalThis as Record<string, unknown>).FormData = (window as unknown as { FormData: unknown }).FormData;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function main() {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { buildPlayerDevelopmentPlan } = await import("@/lib/coaching/player-development");
  const { buildGamePlan, buildGamePlanReview } = await import("@/lib/coaching/game-plan");
  const { game, league, plain } = await import("@/lib/coaching/test-fixtures");
  const { PlayerPlanView } = await import("./player-plan-view");
  const { GamePlanView } = await import("./game-plan-view");
  const { ReviewView } = await import("./review-view");
  const { SquadView } = await import("./squad-view");
  const { SquadSetupForm } = await import("./squad-setup-form");

  async function mount(element: React.ReactElement): Promise<{ container: HTMLDivElement; unmount: () => Promise<void> }> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(element);
    });
    return {
      container,
      unmount: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  }

  const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  // ---- fixtures --------------------------------------------------------------------------
  // A big with poor free throws among five bigs: FREE_THROWS becomes a focus area.
  function playerPlan(games: number) {
    const bigs = ["b1", "b2", "b3", "b4", "b5", "b6"];
    const gs = Array.from({ length: games }, (_, g) => ({
      gameId: `g${g}`, fixtureId: `f${g}`, status: "FINAL", dataCapability: "BOX_SCORE_ONLY", divisionName: "Men", scheduledAt: new Date(Date.UTC(2026, 8, 1 + g)), home: {}, away: {}, periods: [],
      players: bigs.map((id) => ({
        playerId: id, name: id === "b1" ? "Big One" : id, jerseyNumber: id === "b1" ? 12 : null, photoUrl: null, seasonClubId: id === "b1" ? "A" : "B", seasonClubShortName: "x", side: "HOME", didNotPlay: false, minutesPlayed: 0,
        points: 8, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 2,
        fieldGoalsMade: 3, fieldGoalsAttempted: 7, twoPointsMade: 2, twoPointsAttempted: 4, threePointsMade: 1, threePointsAttempted: 3,
        freeThrowsMade: id === "b1" ? 2 : 7, freeThrowsAttempted: id === "b1" ? 5 : 10, offensiveRebounds: null, defensiveRebounds: null, foulsDrawn: null, plusMinus: null, efficiency: null,
        fourPointsMade: null, fourPointsAttempted: null, ultraTimePoints: null,
      })),
    }));
    const meta = new Map(bigs.map((b) => [b, { position: "Center", heightCm: 205 }]));
    return buildPlayerDevelopmentPlan("b1", gs as never, meta)!;
  }

  test("player plan page renders the focus area with its evidence, target and drill block", async () => {
    const plan = playerPlan(8);
    const { container, unmount } = await mount(<PlayerPlanView plan={plan} />);
    try {
      const focus = container.querySelector('[data-focus="FREE_THROWS"]');
      assert.ok(focus, "free throws should be a focus area");
      const body = text(container);
      assert.match(body, /Big One/);
      assert.match(body, /40\.0%/);
      assert.match(body, /Raise free-throw % from 40\.0% to 46\.0%/);
      assert.match(body, /Evidence/);
      assert.match(body, /league bigs/i, "baseline label");
      assert.match(body, /Gate cleared/);
      assert.match(body, /Drill block/);
      assert.match(body, /Success:/);
      assert.ok(container.querySelector('[data-chip="confidence"]'), "confidence chip");
      assert.ok(container.querySelectorAll("details").length >= 2, "evidence and drills sit behind a tap");
    } finally {
      await unmount();
    }
  });

  test("player plan page shows a quiet insufficient-data state, never advice", async () => {
    const plan = playerPlan(2);
    const { container, unmount } = await mount(<PlayerPlanView plan={plan} />);
    try {
      assert.ok(container.querySelector('[data-state="insufficient"]'));
      assert.equal(container.querySelectorAll("[data-focus]").length, 0);
      const rows = container.querySelectorAll('tr[data-insufficient="true"]');
      assert.ok(rows.length > 0, "readings below the gate are listed with their sample");
      assert.match(text(rows[0]), /Not enough data/);
    } finally {
      await unmount();
    }
  });

  // Opponent with a focal scorer, a poor free-throw shooter and a turnover-prone team; our own
  // free-throw shooters are all weak, so no free-throw closer can clear the league median.
  const weakFt = (id: string) => ({ id, players: [1, 2, 3, 4, 5].map((n) => ({ id: `${id}${n}`, stat: { freeThrowsMade: 2, freeThrowsAttempted: 4 } })) });
  const opp = { id: "B", side: { turnovers: 16 }, players: [{ id: "star", stat: { points: 22 } }, { id: "bigFT", stat: { freeThrowsMade: 1, freeThrowsAttempted: 6 } }, { id: "B3" }, { id: "B4" }, { id: "B5", stat: { points: 4 } }] };
  const teams = [weakFt("A"), opp, plain("C"), plain("D")];

  test("game plan page renders keys with evidence, assignments, the defense note and the no-closer note", async () => {
    const plan = buildGamePlan(league(teams, 2), "A", "B", new Map())!;
    assert.equal(plan.status, "OK");
    const { container, unmount } = await mount(<GamePlanView plan={plan} seasonClubId="A" played={[]} />);
    try {
      const keys = [...container.querySelectorAll("[data-key]")].map((k) => k.getAttribute("data-key"));
      assert.ok(keys.includes("DENY_FOCAL_POINT") && keys.includes("FOUL_POOR_FT_SHOOTER"), keys.join());
      assert.ok(container.querySelectorAll("[data-assignment]").length === 3, "top three threats get assignments");
      assert.match(text(container), /Box scores don't measure on-ball defence/);
      assert.match(text(container.querySelector('[data-note="late-game"]')!), /league median/, "no reliable closer is explained, not hidden");
      assert.match(text(container.querySelector('[data-key="DENY_FOCAL_POINT"]')!), /Evidence/);
    } finally {
      await unmount();
    }
  });

  test("game plan page shows the reason when there is not enough data", async () => {
    const plan = buildGamePlan(league([plain("A"), plain("B"), plain("C")], 1), "A", "B", new Map())!;
    assert.equal(plan.status, "INSUFFICIENT_DATA");
    const { container, unmount } = await mount(<GamePlanView plan={plan} seasonClubId="A" played={[]} />);
    try {
      assert.match(text(container.querySelector('[data-state="insufficient"]')!), /needs 3/);
      assert.equal(container.querySelectorAll("[data-key]").length, 0);
    } finally {
      await unmount();
    }
  });

  test("review page marks keys HELD, BROKEN and NOT_TESTABLE with actual vs expected", async () => {
    const plan = buildGamePlan(league(teams, 2), "A", "B", new Map())!;
    const mk = (turnovers: number, starPoints: number | null) =>
      game(plain("A"), { ...opp, side: { turnovers }, players: [...(starPoints == null ? [] : [{ id: "star", stat: { points: starPoints } }]), ...opp.players.slice(1)] });
    const verdictOf = (reviews: ReturnType<typeof buildGamePlanReview>, kind: string) => reviews.find((r) => r.key.kind === kind)!.verdict;

    const held = buildGamePlanReview(plan, mk(20, 8));
    assert.equal(verdictOf(held, "DENY_FOCAL_POINT"), "HELD");
    const broken = buildGamePlanReview(plan, mk(5, 30));
    assert.equal(verdictOf(broken, "DENY_FOCAL_POINT"), "BROKEN");
    const absent = buildGamePlanReview(plan, mk(10, null));
    assert.equal(verdictOf(absent, "DENY_FOCAL_POINT"), "NOT_TESTABLE");

    for (const [reviews, expected] of [[held, "HELD"], [broken, "BROKEN"], [absent, "NOT_TESTABLE"]] as const) {
      const { container, unmount } = await mount(
        <ReviewView focusName="A" opponentName="B" scheduledAt={new Date(Date.UTC(2026, 9, 1))} focusScore={50} opponentScore={48} reviews={reviews} unavailableReason={null} />,
      );
      try {
        const card = container.querySelector('[data-key="DENY_FOCAL_POINT"]')!;
        assert.equal(card.getAttribute("data-verdict"), expected);
        assert.ok(card.querySelector('[data-chip="verdict"]'));
        if (expected !== "NOT_TESTABLE") assert.match(text(card), /Actual .* expected (below|above) /);
        else assert.match(text(card), /Could not be checked/);
        assert.match(text(container.querySelector('[data-summary="verdicts"]')!), /held .* broken .* not testable/);
      } finally {
        await unmount();
      }
    }
  });

  test("review page explains when the plan could not have been made", async () => {
    const { container, unmount } = await mount(
      <ReviewView focusName="A" opponentName="B" scheduledAt={new Date(Date.UTC(2026, 9, 1))} focusScore={1} opponentScore={2} reviews={[]} unavailableReason="Before this game: not enough games." />,
    );
    try {
      assert.match(text(container.querySelector('[data-state="unavailable"]')!), /not enough games/);
    } finally {
      await unmount();
    }
  });

  test("squad page shows the positions banner only while most of the squad has none, and quiet unassessed players", async () => {
    const plan = playerPlan(8);
    const { container, unmount } = await mount(
      <SquadView seasonClubId="A" clubName="Club A" plans={[plan]} unassessed={[{ playerId: "p9", name: "New Player", jerseyNumber: 9 }]} needsPositions />,
    );
    try {
      assert.match(text(container.querySelector('[data-banner="positions"]')!), /Set positions to compare players with their position peers\./);
      assert.match(text(container.querySelector('[data-player="p9"]')!), /No games played yet/);
      assert.ok(container.querySelector('[data-player="b1"] [data-chip="confidence"]'));
    } finally {
      await unmount();
    }
    const quiet = await mount(<SquadView seasonClubId="A" clubName="Club A" plans={[plan]} unassessed={[]} needsPositions={false} />);
    try {
      assert.equal(quiet.container.querySelector('[data-banner="positions"]'), null);
    } finally {
      await quiet.unmount();
    }
  });

  test("squad setup form validates before sending, then submits valid values to the action", async () => {
    const calls: FormData[] = [];
    const action = async (_state: unknown, formData: FormData) => {
      calls.push(formData);
      return { saved: 1 };
    };
    const players = [
      { playerId: "p1", name: "Ada One", jerseyNumber: 4, position: "Unknown", usablePosition: false, heightCm: 0, usableHeight: false },
      { playerId: "p2", name: "Bea Two", jerseyNumber: null, position: "PG", usablePosition: true, heightCm: 180, usableHeight: true },
    ];
    const { container, unmount } = await mount(<SquadSetupForm action={action} players={players} />);
    try {
      const win = window as unknown as { Event: typeof Event; HTMLInputElement: typeof HTMLInputElement; HTMLSelectElement: typeof HTMLSelectElement };
      const setInput = async (name: string, value: string) => {
        const el = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
        const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
        await act(async () => {
          setter.call(el, value);
          el.dispatchEvent(new win.Event("input", { bubbles: true }));
        });
      };
      const submit = async () => {
        await act(async () => {
          container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
          await tick();
        });
        await act(async () => tick());
      };

      // placeholders: unusable values read "Not set"; usable ones keep the current value visible
      assert.equal(container.querySelector<HTMLInputElement>('input[name="height:p1"]')!.placeholder, "Not set");
      assert.equal(container.querySelector<HTMLInputElement>('input[name="height:p2"]')!.placeholder, "180");

      // invalid height: message shown, action never called
      await setInput("height:p1", "250");
      await submit();
      assert.equal(calls.length, 0, "invalid input must not be sent");
      assert.match(text(container.querySelector('[data-player="p1"] [data-error="height"]')!), /140-230/);

      // valid values go through, and the success state shows
      await setInput("height:p1", "182");
      const select = container.querySelector<HTMLSelectElement>('select[name="position:p1"]')!;
      const selSetter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value")!.set!;
      await act(async () => {
        selSetter.call(select, "SG");
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await submit();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].get("height:p1"), "182");
      assert.equal(calls[0].get("position:p1"), "SG");
      assert.match(text(container.querySelector('[role="status"]')!), /Saved 1 player/);
    } finally {
      await unmount();
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
