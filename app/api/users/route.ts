import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { toUserDto } from "@/lib/users";

const DEFAULT_PAGE_SIZE = 20;

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

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return successResponse({
    items: users.map(toUserDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
