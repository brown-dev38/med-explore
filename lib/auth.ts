import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { connection } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { cookies } from "next/headers";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getAccountStatus } from "@/lib/account-status";
import { getMicrosoftConfig, microsoftIdentityFromProfile, MICROSOFT_LINK_COOKIE, MICROSOFT_PROVIDER_ID } from "@/lib/microsoft-config";
import { completeMicrosoftLink, findMicrosoftAccount, microsoftSessionIsLinked, MicrosoftAccountError } from "@/lib/microsoft-accounts";
import { toAuthUser } from "@/lib/auth-user";
import { dashboardPathFor } from "@/lib/permissions";

const microsoft = getMicrosoftConfig();

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

        return toAuthUser(user);
      },
    }),
    ...(microsoft ? [AzureADProvider({
      ...microsoft,
      name: "Microsoft",
      idToken: true,
      checks: ["pkce", "state", "nonce"],
      authorization: { params: { scope: "openid profile email", prompt: "select_account" } },
      // Use the validated ID token; fetching a photo from Microsoft Graph is unnecessary.
      profile(profile) { return { id: profile.sub, name: typeof profile.name === "string" ? profile.name : "Microsoft", email: profile.email ?? null, image: null }; },
    })] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== MICROSOFT_PROVIDER_ID) return account?.provider === "credentials";
      try {
        const identity = microsoftIdentityFromProfile(profile, account.providerAccountId);
        if (!identity) return "/login?error=MicrosoftTenant";
        const intent = (await cookies()).get(MICROSOFT_LINK_COOKIE)?.value;
        if (intent) {
          const session = await getServerSession(authOptions);
          if (!session?.user.id || session.accountStatus !== "ACTIVE") return "/login?error=MicrosoftLinkExpired";
          const profilePath = `${dashboardPathFor(session.user)}/profile`;
          try { await completeMicrosoftLink(intent, session.user.id, identity); }
          catch (error) {
            return `${profilePath}?microsoft=${error instanceof MicrosoftAccountError ? error.code : "unavailable"}`;
          }
          // Linking preserves the existing local session; it does not sign into another user.
          return `${profilePath}?microsoft=linked`;
        }
        const linked = await findMicrosoftAccount(identity);
        if (!linked) return "/login?error=MicrosoftNotLinked";
        if (!linked.user.isActive) return "/login?reason=account-suspended";
        return true;
      } catch {
        return "/login?error=MicrosoftUnavailable";
      }
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === MICROSOFT_PROVIDER_ID) {
        const identity = microsoftIdentityFromProfile(profile, account.providerAccountId);
        const linked = identity ? await findMicrosoftAccount(identity) : null;
        if (!linked?.user.isActive) {
          token.uid = undefined; token.roles = []; token.role = null; token.permissions = [];
          token.accountStatus = linked ? "SUSPENDED" : "UNAUTHENTICATED";
          delete token.microsoftAccountId;
          return token;
        }
        user = toAuthUser(linked.user);
        token.microsoftAccountId = String(linked.id);
      } else if (user) delete token.microsoftAccountId;
      if (user) {
        token.uid = user.id;
        token.role = user.role ?? null;
        token.roles = user.roles ?? [];
        token.permissions = user.permissions ?? [];
        token.accountStatus = "ACTIVE";
        token.name = user.name;
        token.email = user.email;
      } else {
        token.accountStatus = token.uid
          ? await getAccountStatus(token.uid)
          : token.accountStatus ?? "UNAUTHENTICATED";
        if (token.accountStatus === "ACTIVE" && token.microsoftAccountId && token.uid && !await microsoftSessionIsLinked(token.microsoftAccountId, token.uid)) {
          token.accountStatus = "UNAUTHENTICATED";
        }
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
