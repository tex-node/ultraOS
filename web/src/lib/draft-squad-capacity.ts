import type { Prisma } from "@/generated/prisma/client";
import { DraftEventStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type DraftSquadGender = "men" | "women";

export type DraftSquadReadinessStatus =
  | "READY"
  | "INCOMPLETE"
  | "OVER_CAPACITY"
  | "EMPTY"
  | "LOCKED"
  | "FINALIZED";

export type DraftSquadCapacityConfig = {
  menMainDraftTargetSize: number;
  womenMainDraftTargetSize: number;
  minimumAllowed: number;
};

export const draftSquadCapacitySettingKeys = {
  menMainDraftTargetSize: "MEN_MAIN_DRAFT_TARGET_SIZE",
  womenMainDraftTargetSize: "WOMEN_MAIN_DRAFT_TARGET_SIZE",
  minimumAllowed: "DRAFT_SQUAD_MINIMUM_ALLOWED",
} as const;

export const defaultDraftSquadCapacityConfig: DraftSquadCapacityConfig = {
  menMainDraftTargetSize: 7,
  womenMainDraftTargetSize: 5,
  minimumAllowed: 1,
};

function numericSetting(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

// Phase 1 Stage 5.2B-3: `db` is passed in explicitly (the caller's scoped tx where one exists)
// so this read at least runs inside the acting organization's RLS context - the SystemSetting.key
// lookup mechanism itself (a bare key match, no organizationId in the where clause) stays global
// for now, same as game-day-checkin.ts's SystemSetting reads since Stage 5.2A - that's explicitly
// Stage 5.4's job, not this one's. Defaults to the bare client so the two pre-existing unscoped
// callers (draft-cohort/page.tsx, scripts/tryout-metadata-import.ts) keep compiling and behaving
// exactly as before, unconverted.
export async function draftSquadCapacityConfig(db: Db = prisma, seasonId?: string | null): Promise<DraftSquadCapacityConfig> {
  const keys = Object.values(draftSquadCapacitySettingKeys);
  const settings = await db.systemSetting.findMany({
    where: { key: { in: keys }, OR: [{ seasonId: seasonId ?? undefined }, { seasonId: null }] },
    orderBy: { seasonId: "desc" },
    select: { key: true, value: true },
  });
  const valueByKey = new Map<string, unknown>();
  for (const setting of settings) {
    if (!valueByKey.has(setting.key)) valueByKey.set(setting.key, setting.value);
  }
  return {
    menMainDraftTargetSize: numericSetting(valueByKey.get(draftSquadCapacitySettingKeys.menMainDraftTargetSize), defaultDraftSquadCapacityConfig.menMainDraftTargetSize),
    womenMainDraftTargetSize: numericSetting(valueByKey.get(draftSquadCapacitySettingKeys.womenMainDraftTargetSize), defaultDraftSquadCapacityConfig.womenMainDraftTargetSize),
    minimumAllowed: numericSetting(valueByKey.get(draftSquadCapacitySettingKeys.minimumAllowed), defaultDraftSquadCapacityConfig.minimumAllowed),
  };
}

export function draftSquadGenderFromLabel(value: string): DraftSquadGender {
  const normalized = value.toLowerCase();
  if (normalized.includes("women") || normalized.includes("female")) return "women";
  return "men";
}

export function targetSizeForGender(config: DraftSquadCapacityConfig, gender: DraftSquadGender) {
  return gender === "women" ? config.womenMainDraftTargetSize : config.menMainDraftTargetSize;
}

export function classifyDraftSquadReadiness(params: {
  currentSize: number;
  targetSize: number;
  draftEventStatus?: DraftEventStatus | string;
}): DraftSquadReadinessStatus {
  if (params.draftEventStatus === DraftEventStatus.COMPLETED || params.draftEventStatus === "COMPLETED") return "FINALIZED";
  if (params.draftEventStatus === DraftEventStatus.LIVE || params.draftEventStatus === "LIVE") return "LOCKED";
  if (params.currentSize > params.targetSize) return "OVER_CAPACITY";
  if (params.currentSize === 0) return "EMPTY";
  if (params.currentSize < params.targetSize) return "INCOMPLETE";
  return "READY";
}

export function draftSquadStatusSeverity(status: DraftSquadReadinessStatus): "GREEN" | "AMBER" | "RED" | "GREY" | "BLUE" {
  if (status === "READY") return "GREEN";
  if (status === "OVER_CAPACITY") return "RED";
  if (status === "EMPTY") return "GREY";
  if (status === "FINALIZED") return "BLUE";
  return "AMBER";
}
