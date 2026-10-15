import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { toUserDto } from "@/lib/users";
import { deleteUser, DeletionError } from "@/lib/admin-deletion";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasRole(actor, ROLES.ADMIN)) return errorResponse("เฉพาะ ADMIN เท่านั้นที่ลบผู้ใช้งานได้", 403);

  const { id } = await params;
  const userId = parseId(id);
  if (!userId) return errorResponse("ไม่พบผู้ใช้งาน", 404);
  try {
    return successResponse(await deleteUser(userId, BigInt(actor.id)));
  } catch (error) {
    if (error instanceof DeletionError) return errorResponse(error.message, error.status);
    const code = (error as { code?: string }).code;
    if (code === "P2003") return errorResponse("ผู้ใช้นี้มีข้อมูลที่ผูกอยู่ กรุณาปิดใช้งานบัญชีแทนเพื่อเก็บประวัติ", 409);
    if (code === "P2034") return errorResponse("มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองใหม่", 409);
    if (code === "P2025") return errorResponse("ไม่พบผู้ใช้งาน", 404);
    return errorResponse("ลบผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

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

  const body = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { firstname, lastname, studentCode, isActive, roles } = parsed.data;
  if (isActive === false && userId === BigInt(authUser.id)) {
    return errorResponse("ไม่สามารถปิดใช้งานบัญชีที่กำลังล็อกอินอยู่ได้", 409);
  }

  const normalizedStudentCode =
    studentCode === undefined ? undefined : studentCode || null;

  const data: Prisma.UserUpdateInput = {};
  if (firstname !== undefined) data.firstname = firstname || null;
  if (lastname !== undefined) data.lastname = lastname || null;
  if (normalizedStudentCode !== undefined) {
    data.studentCode = normalizedStudentCode;
  }
  if (isActive !== undefined) data.isActive = isActive;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!current) return { error: "ไม่พบผู้ใช้งาน", status: 404 } as const;
      if (!roles && current.userRoles.length !== 1) {
        return { error: "กรุณากำหนดบทบาทให้ผู้ใช้เพียงหนึ่งบทบาท", status: 409 } as const;
      }

      const wasAdmin = current.userRoles.some((assignment) => assignment.role.name === ROLES.ADMIN);
      const willBeAdmin = roles ? roles[0] === ROLES.ADMIN : wasAdmin;
      if (wasAdmin && current.isActive && (isActive === false || !willBeAdmin)) {
        const remainingActiveAdmins = await tx.user.count({ where: {
          id: { not: userId }, isActive: true,
          userRoles: { some: { role: { name: ROLES.ADMIN } } },
        } });
        if (remainingActiveAdmins === 0) {
          return { error: "ต้องมี ADMIN ที่เปิดใช้งานอย่างน้อยหนึ่งคนเสมอ ไม่สามารถปิดบัญชีหรือเปลี่ยนบทบาทนี้ได้", status: 409 } as const;
        }
      }

      if (normalizedStudentCode) {
        const duplicate = await tx.user.findUnique({ where: { studentCode: normalizedStudentCode } });
        if (duplicate && duplicate.id !== userId) {
          return { error: "รหัสนิสิตนี้มีผู้ใช้งานแล้ว", status: 409 } as const;
        }
      }

      const changingRole = roles && (current.userRoles.length !== 1 || current.userRoles[0].role.name !== roles[0]);
      if (changingRole) {
        const role = await tx.role.findUnique({ where: { name: roles[0] } });
        if (!role) return { error: "พบบทบาทที่ไม่ถูกต้อง", status: 400 } as const;
        const assignment = await tx.userRole.updateMany({ where: { userId }, data: { roleId: role.id } });
        if (assignment.count === 0) await tx.userRole.create({ data: { userId, roleId: role.id } });
      }

      const updated = await tx.user.update({
        where: { id: userId }, data,
        include: { userRoles: { include: { role: true } } },
      });
      await tx.auditLog.create({ data: {
        actorId: BigInt(authUser.id), action: "user.update", entityType: "User", entityId: userId,
        details: { isActive: updated.isActive, roles: updated.userRoles.map((assignment) => assignment.role.name) },
      } });
      return { user: toUserDto(updated) };
    }, { isolationLevel: "Serializable" });

    if (result.error) return errorResponse(result.error, result.status);
    return successResponse(result.user);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return errorResponse("รหัสนิสิตหรือบทบาทผู้ใช้ซ้ำ กรุณาตรวจสอบข้อมูล", 409);
    if (code === "P2034") return errorResponse("มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองใหม่", 409);
    console.error("User update failed:", error);
    return errorResponse("บันทึกผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
