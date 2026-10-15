import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sessionExitReason, sessionLoginPath } from "@/lib/session-notices";
import {
  canAccessAdmin,
  hasPermission,
  hasRole,
  type PermissionCode,
  type RoleName,
} from "@/lib/permissions";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  roles: string[];
  permissions: string[];
};

const getCurrentSession = cache(auth);

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getCurrentSession();
  const user = session?.user;
  if (!user?.id) return null;

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role ?? null,
    roles: user.roles ?? [],
    permissions: user.permissions ?? [],
  };
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const session = await getCurrentSession();
    const reason = sessionExitReason(session);
    redirect(reason === "account-suspended" || reason === "account-deleted" ? sessionLoginPath(reason) : "/login");
  }
  return user;
}

export async function requirePermission(
  code: PermissionCode,
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasPermission(user, code)) redirect("/forbidden");
  return user;
}

export async function requireRole(role: RoleName): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasRole(user, role)) redirect("/forbidden");
  return user;
}

export async function requireAdminAccess(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!canAccessAdmin(user)) redirect("/forbidden");
  return user;
}
