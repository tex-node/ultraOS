import "server-only";

export { createGameEvent } from "./createGameEvent";
export {
  loadMutableGame,
  GameNotMutableError,
  GameNotActiveError,
  InvalidEventError,
  type MutableGame,
} from "./load-mutable-game";
export { withGameWrite } from "./with-game-write";
export { loadFinalGameForCorrection, type FinalGame } from "./load-final-game";
export { withFinalGameWrite } from "./with-final-game-write";
export {
  correctStatisticianEvent,
  type CorrectStatisticianEventInput,
  type CorrectionResult,
} from "./correctStatisticianEvent";
export { voidGameEvent } from "./voidGameEvent";
export { applyPlayerShotStatDeltas, applyTeamShotStatDeltas } from "./applyShotStatDeltas";
export { mergeShotStatDeltas } from "@/lib/scoring/shot-stat-deltas";
export { assignNextSequence } from "./sequence";
export type {
  AuthActor,
  CreateGameEventInput,
  EventProvenance,
  EventSource,
  LedgerSourceHint,
  WriteContext,
} from "./types";
