import type { NextAuthOptions } from "next-auth";

// Applications on different ports of one host share a cookie jar. A dedicated
// namespace avoids collisions with other projects using NextAuth defaults.
// This is not a security boundary against an untrusted app on the same host.
export function getAuthCookies(environment = process.env.NODE_ENV): NextAuthOptions["cookies"] {
  if (environment !== "production") return undefined;
  const options = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true };
  return {
    sessionToken: { name: "__Host-medexplore.session-token", options: { ...options } },
    csrfToken: { name: "__Host-medexplore.csrf-token", options: { ...options } },
    callbackUrl: { name: "__Host-medexplore.callback-url", options: { ...options } },
  };
}

export function isAuthSessionCookie(name: string, environment = process.env.NODE_ENV): boolean {
  const cookieName = getAuthCookies(environment)?.sessionToken?.name;
  if (!cookieName) return /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/.test(name);
  return name === cookieName || (name.startsWith(`${cookieName}.`) && /^\d+$/.test(name.slice(cookieName.length + 1)));
}
