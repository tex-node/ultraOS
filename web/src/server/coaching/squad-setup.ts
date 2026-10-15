import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { changedSquadRows, parseSquadSetup, type SquadSetupErrors } from "@/lib/coaching/squad-setup";

// Writes squad position/height for one SeasonClub's roster. Follows the shape of the existing
// single-field player write (setPlayerJerseyNumber): update inside the caller's organization
// transaction, one PLAYER_* audit entry per changed player. Only players on this club's roster
// are touched; only fields the coach actually filled in are written.

export type SquadSetupResult = { ok: true; changed: number } | { ok: false; errors: SquadSetupErrors };

export const SQUAD_SETUP_AUDIT_ACTION = "PLAYER_POSITION_HEIGHT_UPDATED";

export async function applySquadSetup(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; seasonClubId: string; userId: string; values: Record<string, string | undefined> },
): Promise<SquadSetupResult> {
  const roster = await tx.player.findMany({
    where: { organizationId: args.organizationId, seasonClubId: args.seasonClubId },
    select: { id: true, position: true, heightCm: true },
  });
  const parsed = parseSquadSetup(args.values, roster.map((p) => p.id));
  if (!parsed.ok) return parsed;

  const current = new Map(roster.map((p) => [p.id, { position: p.position as string | null, heightCm: p.heightCm as number | null }]));
  const changes = changedSquadRows(parsed.rows, current);
  for (const row of changes) {
    const before = current.get(row.playerId)!;
    const data: { position?: string; heightCm?: number } = {};
    if (row.position != null && row.position !== before.position) data.position = row.position;
    if (row.heightCm != null && row.heightCm !== before.heightCm) data.heightCm = row.heightCm;
    await tx.player.update({ where: { id: row.playerId }, data });
    await writeAuditLog(tx, {
      userId: args.userId,
      organizationId: args.organizationId,
      action: SQUAD_SETUP_AUDIT_ACTION,
      entityType: "Player",
      entityId: row.playerId,
      details: { source: "COACHING_SQUAD_SETUP", previous: { position: before.position, heightCm: before.heightCm }, next: { position: data.position ?? before.position, heightCm: data.heightCm ?? before.heightCm } },
    });
  }
  return { ok: true, changed: changes.length };
}
