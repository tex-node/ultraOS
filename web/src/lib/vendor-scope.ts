import type { UserRole } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";

export type VendorScope = { kind: "all" } | { kind: "vendor"; vendorId: string } | { kind: "none" };

// F5 vendor least privilege: platform-wide staff (event:manage) see every order;
// vendor-linked accounts without it are confined to their own vendor's orders; anyone
// else holds no order scope at all. Pure so the rule is unit-tested; call sites supply
// the vendor lookup (Vendor.userId) themselves.
export function vendorScopeFrom(roles: UserRole[] | undefined, vendorId: string | null): VendorScope {
  if (hasPermission(roles, "event:manage")) return { kind: "all" };
  if (vendorId) return { kind: "vendor", vendorId };
  return { kind: "none" };
}
