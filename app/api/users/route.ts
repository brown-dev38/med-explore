import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { toUserDto } from "@/lib/users";
import { userCreateSchema } from "@/lib/validation";

const DEFAULT_PAGE_SIZE = 20;

export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasRole(actor, ROLES.ADMIN)) return errorResponse("เฉพาะ ADMIN เท่านั้นที่เพิ่มผู้ใช้งานได้", 403);
  const parsed = userCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  const input = parsed.data;
  const studentCode = input.studentCode || null;
  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.user.findFirst({ where: { OR: [
        { username: input.username }, { email: input.email }, ...(studentCode ? [{ studentCode }] : []),
      ] } });
      if (duplicate) return { error: "ชื่อผู้ใช้ อีเมล หรือรหัสนิสิตนี้มีอยู่แล้ว", status: 409 } as const;
      const roles = await tx.role.findMany({ where: { name: { in: input.roles } } });
      if (roles.length !== input.roles.length) return { error: "ไม่พบบทบาทที่เลือก กรุณาตรวจสอบการตั้งค่าบทบาท", status: 400 } as const;
      const created = await tx.user.create({
        data: {
          username: input.username, email: input.email, passwordHash, studentCode,
          firstname: input.firstname || null, lastname: input.lastname || null, isActive: input.isActive,
          userRoles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: { userRoles: { include: { role: true } } },
      });
      await tx.auditLog.create({ data: {
        actorId: BigInt(actor.id), action: "user.create", entityType: "User", entityId: created.id,
        details: { username: created.username, roles: input.roles, isActive: created.isActive },
      } });
      return { user: toUserDto(created) };
    }, { isolationLevel: "Serializable" });
    if (result.error) return errorResponse(result.error, result.status);
    return successResponse(result.user, 201);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return errorResponse("อีเมลหรือรหัสนิสิตนี้มีอยู่แล้ว", 409);
    if (code === "P2034") return errorResponse("มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองเพิ่มผู้ใช้อีกครั้ง", 409);
    return errorResponse("เพิ่มผู้ใช้งานไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.USER_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้", 403);
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const role = searchParams.get("role")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) ||
        DEFAULT_PAGE_SIZE,
    ),
  );

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      { studentCode: { contains: q } },
      { firstname: { contains: q } },
      { lastname: { contains: q } },
    ];
  }
  if (role) {
    where.userRoles = { some: { role: { name: role } } };
  }

  const [total, users, activeAdminCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where: { isActive: true, userRoles: { some: { role: { name: ROLES.ADMIN } } } } }),
  ]);

  return successResponse({
    items: users.map(toUserDto),
    total,
    activeAdminCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
