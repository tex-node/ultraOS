// API v1 error contract (G.20, Part XXIII). One stable shape, one set of stable codes - never a
// raw stack trace or an internal error message leaked to a public consumer.
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "NOT_FOUND"
  | "GAME_NOT_FOUND"
  | "GAME_NOT_LIVE"
  | "PLAYER_NOT_FOUND"
  | "CLUB_NOT_FOUND"
  | "SEASON_NOT_FOUND"
  | "DATA_NOT_CAPTURED"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  GAME_NOT_FOUND: 404,
  GAME_NOT_LIVE: 409,
  PLAYER_NOT_FOUND: 404,
  CLUB_NOT_FOUND: 404,
  SEASON_NOT_FOUND: 404,
  DATA_NOT_CAPTURED: 200, // a real, valid response - see /events for BOX_SCORE_ONLY games
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
};

export function apiError(code: ApiErrorCode, message: string, extraHeaders?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS_BY_CODE[code], headers: extraHeaders });
}
