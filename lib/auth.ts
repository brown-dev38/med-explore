import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getAccountStatus } from "@/lib/account-status";
import { authUserRelations, toAuthUser } from "@/lib/auth-user";
import { getAuthCookies } from "@/lib/auth-cookies";

export const authOptions: NextAuthOptions = {
  cookies: getAuthCookies(),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "ชื่อผู้ใช้", type: "text" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;
        if (!username || !password) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { studentCode: username },
              { email: username },
              { username },
            ],
          },
          include: authUserRelations,
        });

        if (!user || !user.isActive || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return toAuthUser(user);
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      return account?.provider === "credentials";
    },
    async jwt({ token, user }) {
      if (user) {
        delete token.microsoftAccountId;
        token.uid = user.id;
        token.role = user.role ?? null;
        token.roles = user.roles ?? [];
        token.permissions = user.permissions ?? [];
        token.accountStatus = "ACTIVE";
        token.name = user.name;
        token.email = user.email;
      } else {
        // Reject sessions issued by the removed provider until their cookies expire.
        token.accountStatus = "microsoftAccountId" in token
          ? "UNAUTHENTICATED"
          : token.uid ? await getAccountStatus(token.uid) : token.accountStatus ?? "UNAUTHENTICATED";
        if (token.accountStatus !== "ACTIVE" || !token.uid) {
          token.uid = undefined;
          token.role = null;
          token.roles = [];
          token.permissions = [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accountStatus = token.accountStatus ?? "UNAUTHENTICATED";
      if (session.user) {
        session.user.id = token.uid ?? "";
        session.user.role = token.role ?? null;
        session.user.roles = token.roles ?? [];
        session.user.permissions = token.permissions ?? [];
      }
      return session;
    },
  },
};

export async function auth() {
  // NextAuth generates CSRF randomness before reading cookies; wait for a real
  // request so Cache Components does not execute it during prerendering.
  await connection();
  return getServerSession(authOptions);
}
