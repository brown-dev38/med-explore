import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
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
    uid?: string;
    role?: string | null;
    roles?: string[];
    permissions?: string[];
  }
}
