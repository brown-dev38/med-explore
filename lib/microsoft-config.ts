const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MICROSOFT_PROVIDER_ID = "azure-ad";
export const MICROSOFT_LINK_COOKIE = "medexplore.microsoft-link";
export const MICROSOFT_LINK_LIFETIME = 600;

export function getMicrosoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim().toLowerCase();
  if (!clientId || !guid.test(clientId) || !clientSecret || !tenantId || !guid.test(tenantId) || tenantId === "9188040d-6c67-4c5b-b112-36a304b66dad") return null;
  return { clientId, clientSecret, tenantId };
}

export function microsoftLinkCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
    path: "/api/auth", maxAge: MICROSOFT_LINK_LIFETIME };
}

export type MicrosoftIdentity = { tenantId: string; objectId: string; label: string | null };

// Only call with the ID-token profile already verified by NextAuth/openid-client.
export function microsoftIdentityFromProfile(profile: unknown, providerAccountId: string): MicrosoftIdentity | null {
  const config = getMicrosoftConfig();
  if (!config || !profile || typeof profile !== "object") return null;
  const claims = profile as Record<string, unknown>;
  if (typeof claims.tid !== "string" || claims.tid.toLowerCase() !== config.tenantId ||
      typeof claims.oid !== "string" || !guid.test(claims.oid) ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub !== providerAccountId ||
      claims.iss !== `https://login.microsoftonline.com/${config.tenantId}/v2.0`) return null;
  const label = typeof claims.email === "string" ? claims.email : typeof claims.preferred_username === "string" ? claims.preferred_username : null;
  return { tenantId: config.tenantId, objectId: claims.oid.toLowerCase(), label: label?.slice(0, 191) ?? null };
}
