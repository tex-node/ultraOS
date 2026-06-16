import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface User {
    role: UserRole;
    roles: UserRole[];
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      roles: UserRole[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    roles: UserRole[];
  }
}
