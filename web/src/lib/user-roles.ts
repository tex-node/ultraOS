import type { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";

// Phase 1 multi-tenancy: UserRoleAssignment.organizationId is nullable (null = a platform-level
// grant - see the Organization model's doc comment in schema.prisma). Postgres unique constraints
// don't treat NULL as "one specific value" - multiple (userId, role, NULL) rows would NOT violate
// @@unique([userId, role, organizationId]), so a plain upsert-by-compound-key can't be used for
// platform-level grants (Prisma's generated compound-unique input correctly refuses `null` for
// exactly this reason). This finds-then-branches instead, so every call site stays correct
// regardless of whether it's granting a platform-level or an organization-scoped role.
export async function upsertRoleAssignment(
  db: Prisma.TransactionClient,
  params: { userId: string; role: UserRole; organizationId?: string | null; grantedById?: string | null },
) {
  const organizationId = params.organizationId ?? null;
  const existing = await db.userRoleAssignment.findFirst({
    where: { userId: params.userId, role: params.role, organizationId },
  });
  if (existing) {
    return db.userRoleAssignment.update({
      where: { id: existing.id },
      data: {
        revokedAt: null,
        ...(params.grantedById ? { grantedById: params.grantedById } : {}),
      },
    });
  }
  return db.userRoleAssignment.create({
    data: {
      userId: params.userId,
      role: params.role,
      organizationId,
      grantedById: params.grantedById ?? undefined,
    },
  });
}
