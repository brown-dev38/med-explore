import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ค้นหาผู้ใช้งาน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const q = new URL(req.url).searchParams.get("q")?.trim();

  const registered = await prisma.participation.findMany({
    where: { activityId },
    select: { userId: true },
  });
  const excludeIds = registered.map((r) => r.userId);

  const where: Prisma.UserWhereInput = {
    isActive: true,
    id: { notIn: excludeIds },
  };
  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      { studentCode: { contains: q } },
      { firstname: { contains: q } },
      { lastname: { contains: q } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { studentCode: "asc" },
    take: 200,
  });

  return successResponse(
    users.map((u) => ({
      id: String(u.id),
      name:
        [u.firstname, u.lastname].filter(Boolean).join(" ") || u.username,
      studentCode: u.studentCode,
      email: u.email,
    })),
  );
}
