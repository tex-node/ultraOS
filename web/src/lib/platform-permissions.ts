import { UserRole } from "@/generated/prisma/enums";
import { roleGrantsPermission, type Permission } from "@/lib/permissions";

export type PlatformRoleGrantReader = {
  userRoleAssignment: {
    findMany(args: {
      where: { userId: string; organizationId: null; revokedAt: null };
      select: { role: true };
    }): Promise<{ role: UserRole }[]>;
  };
};

export async function userHasPlatformPermission(
  userId: string,
  permission: Permission,
  db: PlatformRoleGrantReader,
) {
  const grants = await db.userRoleAssignment.findMany({
    where: { userId, organizationId: null, revokedAt: null },
    select: { role: true },
  });

  return grants.some((grant) => roleGrantsPermission(grant.role, permission));
}
