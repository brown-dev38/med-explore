import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { PERMISSIONS, ROLES, dashboardPathFor } from "@/lib/permissions";

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

  if (!token) {
    if (isAdminArea || isOrganizerArea || isDashboardArea) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  const roles = (token.roles as string[] | undefined) ?? [];
  const permissions = (token.permissions as string[] | undefined) ?? [];
  const principal = { roles, permissions };

  if (AUTH_PAGES.includes(pathname) || pathname === "/") {
    return NextResponse.redirect(
      new URL(dashboardPathFor(principal), request.url),
    );
  }

  if (isAdminArea) {
    if (!roles.includes(ROLES.ADMIN)) {
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  if (isOrganizerArea) {
    const allowed =
      roles.includes(ROLES.ADMIN) ||
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
