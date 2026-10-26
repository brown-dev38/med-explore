import type { Prisma } from "@prisma/client";

export const authUserRelations = { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;

export function toAuthUser(user: Prisma.UserGetPayload<{ include: typeof authUserRelations }>) {
  const roles = user.userRoles.map((assignment) => assignment.role.name);
  const permissions = [...new Set(user.userRoles.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)))];
  return { id: String(user.id), name: [user.firstname, user.lastname].filter(Boolean).join(" ") || user.username,
    email: user.email, role: roles[0] ?? null, roles, permissions };
}
