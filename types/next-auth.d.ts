import type { DefaultSession } from "next-auth";
import type { AccountStatus } from "@/lib/account-status";

declare module "next-auth" {
  interface Session {
    accountStatus?: AccountStatus;
    user: {
      id: string;
      role: string | null;
      roles: string[];
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role?: string | null;
    roles?: string[];
    permissions?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accountStatus?: AccountStatus;
    uid?: string;
    microsoftAccountId?: string;
    role?: string | null;
    roles?: string[];
    permissions?: string[];
  }
}
