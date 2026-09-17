// Basketball rule presets.
//
// Ultra Basketball is the league's own short format (2 x 10-minute halves, running clock, Ultra Time
// and a four-point shot). These presets let a tournament play the standard game instead - four
// quarters with a stopped clock - without touching code.

export type BasketballPresetKey = "ULTRA" | "FIBA_4X10" | "NBA_4X12";

export type BasketballPreset = {
  key: BasketballPresetKey;
  label: string;
  description: string;
  ruleValues: Record<string, number | string | boolean>;
};

export const BASKETBALL_PRESETS: BasketballPreset[] = [
  {
    key: "ULTRA",
    label: "Ultra Basketball (2 × 10, running clock)",
    description: "The league's own format: two 10-minute halves, running clock, Ultra Time and the four-point shot.",
    ruleValues: {
      PERIOD_COUNT: 2,
      PERIOD_MINUTES: 10,
      OVERTIME_MINUTES: 5,
      SHOT_CLOCK_SECONDS: 20,
      CLOCK_MODE: "RUNNING",
      FOUR_POINT_ENABLED: true,
      ULTRA_TIME_ENABLED: true,
    },
  },
  {
    key: "FIBA_4X10",
    label: "Standard — 4 × 10 (FIBA)",
    description: "Four 10-minute quarters, stopped clock, 24-second shot clock, overtime periods of 5 minutes.",
    ruleValues: {
      PERIOD_COUNT: 4,
      PERIOD_MINUTES: 10,
      OVERTIME_MINUTES: 5,
      SHOT_CLOCK_SECONDS: 24,
      CLOCK_MODE: "STOPPAGE",
      FOUR_POINT_ENABLED: false,
      ULTRA_TIME_ENABLED: false,
    },
  },
  {
    key: "NBA_4X12",
    label: "Standard — 4 × 12 (NBA)",
    description: "Four 12-minute quarters, stopped clock, 24-second shot clock, overtime periods of 5 minutes.",
    ruleValues: {
      PERIOD_COUNT: 4,
      PERIOD_MINUTES: 12,
      OVERTIME_MINUTES: 5,
      SHOT_CLOCK_SECONDS: 24,
      CLOCK_MODE: "STOPPAGE",
      FOUR_POINT_ENABLED: false,
      ULTRA_TIME_ENABLED: false,
    },
  },
];

export function getBasketballPreset(key: string | null | undefined): BasketballPreset | null {
  if (!key) return null;
  return BASKETBALL_PRESETS.find((preset) => preset.key === key) ?? null;
}

// Which preset (if any) a set of resolved rule values matches, for showing the current format.
export function matchBasketballPreset(rules: Record<string, unknown>): BasketballPreset | null {
  return (
    BASKETBALL_PRESETS.find((preset) =>
      Object.entries(preset.ruleValues).every(([key, value]) => rules[key] === value),
    ) ?? null
  );
}
