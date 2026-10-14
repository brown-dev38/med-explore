import "server-only";
import type { Prisma } from "@prisma/client";
import type { UserDto } from "@/types/user";

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { userRoles: { include: { role: true } } };
}>;

export function toUserDto(user: UserWithRoles): UserDto {
  return {
    id: String(user.id),
    studentCode: user.studentCode,
    username: user.username,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    isActive: user.isActive,
    roles: user.userRoles.map((userRole) => userRole.role.name),
    createdAt: user.createdAt.toISOString(),
  };
}
