import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS, ROLES } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toUserDto } from "@/lib/users";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.USER_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้", 403);
  }

  const { id } = await params;
  const userId = parseId(id);
  if (!userId) return errorResponse("ไม่พบผู้ใช้งาน", 404);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!target) return errorResponse("ไม่พบผู้ใช้งาน", 404);

  return successResponse(toUserDto(target));
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const authUser = await getCurrentUser();
  if (!authUser) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(authUser, PERMISSIONS.USER_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ดำเนินการ", 403);
  }

  const { id } = await params;
  const userId = parseId(id);
  if (!userId) return errorResponse("ไม่พบผู้ใช้งาน", 404);

  const current = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!current) return errorResponse("ไม่พบผู้ใช้งาน", 404);

  const body = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { firstname, lastname, studentCode, isActive, roles } = parsed.data;

  let roleIds: bigint[] | null = null;
  if (roles) {
    const uniqueNames = [...new Set(roles)];
    const foundRoles = await prisma.role.findMany({
      where: { name: { in: uniqueNames } },
    });
    if (foundRoles.length !== uniqueNames.length) {
      return errorResponse("พบบทบาทที่ไม่ถูกต้อง", 400);
    }
    roleIds = foundRoles.map((role) => role.id);

    const wasAdmin = current.userRoles.some(
      (userRole) => userRole.role.name === ROLES.ADMIN,
    );
    const willBeAdmin = uniqueNames.includes(ROLES.ADMIN);
    if (wasAdmin && !willBeAdmin) {
      const adminCount = await prisma.user.count({
        where: { userRoles: { some: { role: { name: ROLES.ADMIN } } } },
      });
      if (adminCount <= 1) {
        return errorResponse("ต้องมีผู้ดูแลระบบอย่างน้อยหนึ่งคนเสมอ", 409);
      }
    }
  }

  const normalizedStudentCode =
    studentCode === undefined ? undefined : studentCode || null;

  if (normalizedStudentCode) {
    const duplicate = await prisma.user.findUnique({
      where: { studentCode: normalizedStudentCode },
    });
    if (duplicate && duplicate.id !== userId) {
      return errorResponse("รหัสนิสิตนี้มีผู้ใช้งานแล้ว", 409);
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (firstname !== undefined) data.firstname = firstname || null;
  if (lastname !== undefined) data.lastname = lastname || null;
  if (normalizedStudentCode !== undefined) {
    data.studentCode = normalizedStudentCode;
  }
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.$transaction(async (tx) => {
    if (roleIds) {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
        });
      }
    }
    return tx.user.update({
      where: { id: userId },
      data,
      include: { userRoles: { include: { role: true } } },
    });
  });

  await recordAudit({
    actorId: BigInt(authUser.id),
    action: "user.update",
    entityType: "User",
    entityId: userId,
    details: {
      isActive: updated.isActive,
      roles: updated.userRoles.map((ur) => ur.role.name),
    },
  });

  return successResponse(toUserDto(updated));
}
