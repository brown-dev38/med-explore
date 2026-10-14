import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toParticipationDto } from "@/lib/participations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const participations = await prisma.participation.findMany({
    where: { activityId },
    include: { user: true, attendanceRecords: true },
    orderBy: { createdAt: "asc" },
  });

  return successResponse(participations.map(toParticipationDto));
}

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const body = await req.json().catch(() => null);
  const targetIdRaw =
    body && typeof body.userId === "string" ? body.userId : null;

  let userId = BigInt(user.id);
  let addedByStaff = false;

  if (targetIdRaw) {
    if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
      return errorResponse("ไม่มีสิทธิ์เพิ่มผู้ลงทะเบียนแทน", 403);
    }
    const targetId = parseId(targetIdRaw);
    if (!targetId) return errorResponse("ไม่พบผู้ใช้งาน", 400);
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return errorResponse("ไม่พบผู้ใช้งาน", 400);
    userId = target.id;
    addedByStaff = true;
  }

  if (!addedByStaff && activity.status !== "PUBLISHED") {
    return errorResponse("กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน", 400);
  }

  try {
    await prisma.participation.create({
      data: {
        activityId,
        userId,
        status: "REGISTERED",
        eligibilityStatus: "PENDING",
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return errorResponse("ผู้ใช้นี้ลงทะเบียนกิจกรรมนี้แล้ว", 409);
    }
    throw error;
  }

  await recordAudit({
    actorId: BigInt(user.id),
    action: addedByStaff ? "participation.add" : "participation.register",
    entityType: "Participation",
    entityId: activityId,
    details: { activityId: String(activityId), userId: String(userId) },
  });

  const created = await prisma.participation.findUnique({
    where: { activityId_userId: { activityId, userId } },
    include: { user: true, attendanceRecords: true },
  });

  return successResponse(created ? toParticipationDto(created) : null, 201);
}
