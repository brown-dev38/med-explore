import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { PERMISSIONS, ROLES, dashboardPathFor } from "@/lib/permissions";
import { isActiveAccount } from "@/lib/account-status";

const AUTH_PAGES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isOrganizerArea =
    pathname === "/organizer" || pathname.startsWith("/organizer/");
  const isDashboardArea =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // Old provider sessions must not grant access after provider removal.
  if (!token || "microsoftAccountId" in token) {
    const response = isAdminArea || isOrganizerArea || isDashboardArea
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next();
    if (token) {
      for (const cookie of request.cookies.getAll()) {
        if (/^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/.test(cookie.name)) {
          response.cookies.delete(cookie.name);
        }
      }
    }
    return response;
  }

  const roles = (token.roles as string[] | undefined) ?? [];
  const permissions = (token.permissions as string[] | undefined) ?? [];
  const principal = { roles, permissions };

  if (AUTH_PAGES.includes(pathname) || pathname === "/") {
    if (!(await isActiveAccount(token.uid))) {
      // Clear every session cookie chunk so a deleted account can reach login.
      const response = NextResponse.next();
      for (const cookie of request.cookies.getAll()) {
        if (/^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?$/.test(cookie.name)) {
          response.cookies.delete(cookie.name);
        }
      }
      return response;
    }
    return NextResponse.redirect(
      new URL(dashboardPathFor(principal), request.url),
    );
  }

  if (isAdminArea) {
    if (!roles.includes(ROLES.ADMIN)) {
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  if (isDashboardArea) {
    if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.ORGANIZER)) {
      return NextResponse.redirect(new URL(dashboardPathFor(principal), request.url));
    }
    if (!roles.includes(ROLES.STUDENT)) {
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  if (isOrganizerArea) {
    const allowed =
      roles.includes(ROLES.ADMIN) ||
      roles.includes(ROLES.ORGANIZER) ||
      permissions.includes(PERMISSIONS.ACTIVITY_MANAGE);
    if (!allowed) {
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
