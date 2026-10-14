import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
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
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!user || !user.isActive || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        const roles = user.userRoles.map((userRole) => userRole.role.name);
        const permissions = [
          ...new Set(
            user.userRoles.flatMap((userRole) =>
              userRole.role.permissions.map((rp) => rp.permission.code),
            ),
          ),
        ];

        return {
          id: String(user.id),
          name:
            user.firstname && user.lastname
              ? `${user.firstname} ${user.lastname}`
              : user.username,
          role: roles[0] ?? null,
          roles,
          permissions,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role ?? null;
        token.roles = user.roles ?? [];
        token.permissions = user.permissions ?? [];
      }
      return token;
    },
    async session({ session, token }) {
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

export function auth() {
  return getServerSession(authOptions);
}
