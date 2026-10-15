import type { DevelopmentDimensionKey } from "./config";

// Drill registry (ADR-011). Code is the default authority, like the sport-definition registry; a
// later phase may let clubs add or override drills from the database. Keep drills standard,
// equipment-light (most venues have one court, a few balls, cones) and measurable, so a Target
// can be tracked from the drill's success measure.

export type DrillLevel = "FOUNDATION" | "BUILD" | "GAME_SPEED";

export type DrillDefinition = {
  id: string;
  name: string;
  dimension: DevelopmentDimensionKey;
  level: DrillLevel;
  durationMinutes: number;
  equipment: string;
  description: string;
  coachingPoints: string[];
  successMeasure: string;
};

export const DRILLS: DrillDefinition[] = [
  // SCORING_EFFICIENCY
  { id: "se-mikan", name: "Mikan series", dimension: "SCORING_EFFICIENCY", level: "FOUNDATION", durationMinutes: 8, equipment: "1 ball, 1 basket",
    description: "Alternating right- and left-hand layups under the rim without the ball touching the floor; progress to reverse Mikans.",
    coachingPoints: ["Use the backboard square", "Finish with the hand away from the defender", "Keep the ball high"], successMeasure: "20 makes in 45 seconds" },
  { id: "se-finishing-contact", name: "Finishing through contact", dimension: "SCORING_EFFICIENCY", level: "BUILD", durationMinutes: 10, equipment: "1 ball, contact pad",
    description: "Drive from the wing, coach bumps with a pad at the restricted area, player finishes off one or two feet.",
    coachingPoints: ["Gather on a two-foot jump stop when bumped", "Chin the ball", "Eyes on the rim through contact"], successMeasure: "7/10 finishes with contact" },
  { id: "se-shot-selection", name: "Shot-selection 3v3", dimension: "SCORING_EFFICIENCY", level: "GAME_SPEED", durationMinutes: 12, equipment: "Full half court",
    description: "3v3 where only layups, open catch-and-shoot jumpers and free throws count; contested pull-ups lose a point.",
    coachingPoints: ["Count the defender's distance before shooting", "Drive closeouts, don't settle", "One more pass for the open shot"], successMeasure: "Team true shooting above 55% in the drill" },

  // FREE_THROWS
  { id: "ft-form-ladder", name: "Form-shooting ladder", dimension: "FREE_THROWS", level: "FOUNDATION", durationMinutes: 8, equipment: "1 ball, 1 basket",
    description: "One-hand form shots from 1 m, 2 m, 3 m, then the free-throw line; move back only after 5 straight swishes or makes.",
    coachingPoints: ["Same routine every shot", "Elbow under the ball", "Hold the follow-through"], successMeasure: "Reaches the line within 6 minutes" },
  { id: "ft-routine-50", name: "50 routine free throws", dimension: "FREE_THROWS", level: "BUILD", durationMinutes: 12, equipment: "1 ball, 1 basket, partner",
    description: "Five sets of 10, full pre-shot routine on every attempt, partner records makes.",
    coachingPoints: ["Breath, dribble count, eyes on target: never skip the routine", "Legs drive the shot"], successMeasure: "Logged FT% per set; target matches the plan's Target" },
  { id: "ft-fatigue", name: "Free throws under fatigue", dimension: "FREE_THROWS", level: "GAME_SPEED", durationMinutes: 10, equipment: "Court, 1 ball",
    description: "Sprint baseline to baseline twice, then shoot two free throws immediately; repeat 5 times.",
    coachingPoints: ["Slow the routine down when tired", "Same release point as when fresh"], successMeasure: "7/10 makes under fatigue" },
  { id: "ft-one-and-one", name: "One-and-one pressure", dimension: "FREE_THROWS", level: "GAME_SPEED", durationMinutes: 8, equipment: "1 ball, team watching",
    description: "Player shoots a one-and-one in front of the team; a miss on the first means the team runs.",
    coachingPoints: ["Own the routine, ignore the noise"], successMeasure: "Both made in 4 of 5 rounds" },

  // THREE_POINT
  { id: "3p-form-arc", name: "Around-the-arc spot-up", dimension: "THREE_POINT", level: "FOUNDATION", durationMinutes: 10, equipment: "1 ball, 1 basket, rebounder",
    description: "Five spots (corners, wings, top), 5 catch-and-shoot attempts per spot with a rebounder passing.",
    coachingPoints: ["Feet set before the catch", "Hop or 1-2 step, same every time", "Shoot on the way up"], successMeasure: "12/25 or better, logged per spot" },
  { id: "3p-relocation", name: "Relocation threes", dimension: "THREE_POINT", level: "BUILD", durationMinutes: 10, equipment: "1 ball, passer",
    description: "Pass to the passer, relocate one spot along the arc, catch and shoot within 1.5 seconds.",
    coachingPoints: ["Show hands as a target", "Square up on the catch"], successMeasure: "10/20 in under 2 minutes" },
  { id: "3p-closeout-decision", name: "Closeout read: shoot, drive or swing", dimension: "THREE_POINT", level: "GAME_SPEED", durationMinutes: 10, equipment: "1 ball, 1 defender",
    description: "Defender closes out from the paint at varying speeds; shooter must shoot if open, drive a hard closeout, or swing.",
    coachingPoints: ["Decide on the catch, not after a dribble", "Only shoot open threes"], successMeasure: "Correct decision 8/10" },

  // FOUR_POINT (Ultra rules)
  { id: "4p-range-ladder", name: "Deep-range ladder", dimension: "FOUR_POINT", level: "FOUNDATION", durationMinutes: 10, equipment: "1 ball, rebounder",
    description: "Shoot from the three-point line, one step back, then the four-point line; only move back after 3 makes.",
    coachingPoints: ["Power comes from the legs, not the arms", "Keep the same release angle"], successMeasure: "Reaches the four-point line with form intact" },
  { id: "4p-catch-shoot", name: "Four-point catch-and-shoot", dimension: "FOUR_POINT", level: "BUILD", durationMinutes: 10, equipment: "1 ball, passer",
    description: "Catch-and-shoot from three four-point spots, 5 attempts each, game pace passes.",
    coachingPoints: ["Only from rhythm catches", "Feet behind the line before the catch"], successMeasure: "5/15 or better (logged)" },
  { id: "4p-ultra-time", name: "Ultra Time pressure set", dimension: "FOUR_POINT", level: "GAME_SPEED", durationMinutes: 8, equipment: "Half court, clock",
    description: "Final-minute scenario: down 6 with 40 seconds, run the set and take only the four-point look if it is open.",
    coachingPoints: ["Clock awareness", "A contested four is worse than an open two in most scores"], successMeasure: "Open look created in 4 of 6 reps" },

  // PLAYMAKING
  { id: "pm-two-ball", name: "Two-ball pound series", dimension: "PLAYMAKING", level: "FOUNDATION", durationMinutes: 8, equipment: "2 balls",
    description: "Stationary two-ball dribbles: same time, alternating, high-low, crossovers, eyes up reading coach's fingers.",
    coachingPoints: ["Eyes up the whole time", "Pound the ball, don't pat it"], successMeasure: "60 seconds per pattern with no lost ball" },
  { id: "pm-pick-and-roll-reads", name: "Pick-and-roll reads 2v2", dimension: "PLAYMAKING", level: "BUILD", durationMinutes: 12, equipment: "Half court",
    description: "Ball handler and screener vs two defenders; coach calls the coverage (drop, switch, hedge) and the handler must make the right read.",
    coachingPoints: ["Read the big's defender first", "Pocket pass on the hedge, pull-up on the drop"], successMeasure: "Correct read 7/10" },
  { id: "pm-advantage-4v3", name: "4v3 advantage passing", dimension: "PLAYMAKING", level: "GAME_SPEED", durationMinutes: 10, equipment: "Half court",
    description: "Four attackers vs three defenders; possession scores only from a pass that leads directly to a shot at the rim or an open three.",
    coachingPoints: ["Draw two, pass to the open man", "Pass before the defender recovers"], successMeasure: "Assisted score on 6 of 10 possessions" },

  // BALL_SECURITY
  { id: "bs-protect-dribble", name: "Protect-the-dribble gauntlet", dimension: "BALL_SECURITY", level: "FOUNDATION", durationMinutes: 8, equipment: "1 ball, 2 defenders with pads",
    description: "Dribble through a lane of two defenders swiping with pads; ball must stay on the body side away from the defender.",
    coachingPoints: ["Off-arm bar", "Low dribble in traffic", "Change hands behind the body, not in front"], successMeasure: "Lane completed 8/10 times with no turnover" },
  { id: "bs-pressure-break", name: "Full-court pressure break", dimension: "BALL_SECURITY", level: "BUILD", durationMinutes: 10, equipment: "Full court",
    description: "Inbound against a trap; handler must beat the trap with the dribble or pass within 5 seconds.",
    coachingPoints: ["Split or retreat dribble, never pick it up in the trap", "Pass fake to move the trapper"], successMeasure: "Fewer than 2 turnovers in 10 possessions" },
  { id: "bs-turnover-tax", name: "Turnover-tax scrimmage", dimension: "BALL_SECURITY", level: "GAME_SPEED", durationMinutes: 12, equipment: "Full court",
    description: "Normal scrimmage where every turnover gives the other team 3 points.",
    coachingPoints: ["Value each possession", "Jump stop when in doubt"], successMeasure: "Player's turnovers logged per 10 minutes" },

  // REBOUNDING
  { id: "rb-box-out-wars", name: "Box-out wars", dimension: "REBOUNDING", level: "FOUNDATION", durationMinutes: 8, equipment: "1 ball, 1 basket",
    description: "1v1 inside the key: coach shoots, defender must box out and keep the attacker off the ball until it lands.",
    coachingPoints: ["Find, hit, then get", "Wide base, butt into the attacker's thighs"], successMeasure: "Wins 7 of 10 battles" },
  { id: "rb-pursuit", name: "Rebound pursuit and outlet", dimension: "REBOUNDING", level: "BUILD", durationMinutes: 10, equipment: "1 ball",
    description: "Coach shoots from different spots; player pursues the miss, secures it with two hands and outlets to a guard.",
    coachingPoints: ["Most misses go long and to the opposite side", "Chin the ball before turning"], successMeasure: "Secures 8 of 10" },
  { id: "rb-crash-3v3", name: "3v3 crash-the-glass", dimension: "REBOUNDING", level: "GAME_SPEED", durationMinutes: 12, equipment: "Half court",
    description: "3v3 where offensive rebounds score 2 points and defensive rebounds 1.",
    coachingPoints: ["Every player hits someone on a shot", "Attack the ball at its highest point"], successMeasure: "Rebounds logged per player" },

  // DEFENSIVE_ACTIVITY
  { id: "da-slides", name: "Defensive slide lanes", dimension: "DEFENSIVE_ACTIVITY", level: "FOUNDATION", durationMinutes: 8, equipment: "Cones",
    description: "Zig-zag slides between cones the length of the court, with a drop step at each cone.",
    coachingPoints: ["Stay low, never cross the feet", "Hands active and wide"], successMeasure: "Full court in under the set time, correct form" },
  { id: "da-closeouts", name: "Closeout and contain", dimension: "DEFENSIVE_ACTIVITY", level: "BUILD", durationMinutes: 10, equipment: "1 ball, 1 attacker",
    description: "Defender closes out from the paint to a shooter, high hand on the shot, then contains the drive for two dribbles.",
    coachingPoints: ["Sprint two thirds, chop the last third", "High hand, no flying by"], successMeasure: "Contains the drive 7 of 10" },
  { id: "da-deflections", name: "Deflection shell drill", dimension: "DEFENSIVE_ACTIVITY", level: "GAME_SPEED", durationMinutes: 12, equipment: "Half court",
    description: "4v4 shell drill; defenders score for deflections, charges and steals; offense must make 4 passes before shooting.",
    coachingPoints: ["Jump to the ball on every pass", "Hands in passing lanes, feet in front"], successMeasure: "Deflections per player logged" },

  // FOUL_DISCIPLINE
  { id: "fd-hands-back", name: "Hands-back closeouts", dimension: "FOUL_DISCIPLINE", level: "FOUNDATION", durationMinutes: 8, equipment: "1 ball, shooter",
    description: "Closeouts where the defender must contest with a vertical hand and keep the other hand behind the back.",
    coachingPoints: ["Contest without contact", "Land in front, not on the shooter"], successMeasure: "Zero contact on 10 closeouts" },
  { id: "fd-verticality", name: "Verticality wall", dimension: "FOUL_DISCIPLINE", level: "BUILD", durationMinutes: 8, equipment: "1 ball, attacker, pad",
    description: "Help defender rotates under the rim and goes straight up with arms vertical as the attacker drives in.",
    coachingPoints: ["Arms straight up, no swiping down", "Jump up, not forward"], successMeasure: "Vertical contest without a foul 8 of 10" },
  { id: "fd-no-reach", name: "No-reach scrimmage", dimension: "FOUL_DISCIPLINE", level: "GAME_SPEED", durationMinutes: 12, equipment: "Full court",
    description: "Scrimmage where any reach-in or hand-check foul gives the other team the ball plus a point.",
    coachingPoints: ["Move the feet, not the hands", "Make the attacker change direction"], successMeasure: "Player's fouls per 10 minutes logged" },
];

// Weakest players start with the fundamentals; others start at BUILD and finish at game speed.
export function drillBlockFor(dimension: DevelopmentDimensionKey, percentile: number, count: number): DrillDefinition[] {
  const order: DrillLevel[] = percentile < 20 ? ["FOUNDATION", "BUILD", "GAME_SPEED"] : ["BUILD", "GAME_SPEED", "FOUNDATION"];
  const forDimension = DRILLS.filter((d) => d.dimension === dimension);
  const sorted = [...forDimension].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return sorted.slice(0, count);
}
