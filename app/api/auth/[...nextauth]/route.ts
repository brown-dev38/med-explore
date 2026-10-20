import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { MICROSOFT_LINK_COOKIE, MICROSOFT_PROVIDER_ID, microsoftLinkCookieOptions } from "@/lib/microsoft-config";

const handler = NextAuth(authOptions);

async function authHandler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  const response: Response = await handler(request, context);
  const { nextauth } = await context.params;
  if (nextauth[0] === "callback" && nextauth[1] === MICROSOFT_PROVIDER_ID) {
    response.headers.append("Set-Cookie", `${MICROSOFT_LINK_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${microsoftLinkCookieOptions().secure ? "; Secure" : ""}`);
  }
  return response;
}

export { authHandler as GET, authHandler as POST };
