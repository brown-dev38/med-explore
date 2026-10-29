import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canViewStudents, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toParticipationDto } from "@/lib/participations";
import { addParticipantsAndAward } from "@/lib/activity-participants";
import { bulkParticipantSchema } from "@/lib/validation";
import { AttendanceError, backfillAttendanceResults } from "@/lib/attendance";

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

  try {
    await backfillAttendanceResults(undefined, activityId);
  } catch (error) {
    if (!(error instanceof AttendanceError && error.status === 409)) {
      return errorResponse("ประเมินดาวอัตโนมัติไม่สำเร็จ ระบบจะลองใหม่เมื่อรีเฟรชข้อมูล", 500);
    }
  }
  const participations = await prisma.participation.findMany({
    where: { activityId },
    include: { user: true, attendanceRecords: true, starTransactions: true },
    orderBy: { createdAt: "asc" },
  });

  const response = successResponse(participations.map(toParticipationDto));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
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

  const userId = BigInt(user.id);

  if (targetIdRaw) {
    if (!canViewStudents(user) || !hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
      return errorResponse("ไม่มีสิทธิ์เพิ่มผู้ลงทะเบียนแทน", 403);
    }
    const parsed = bulkParticipantSchema.safeParse({ userIds: [targetIdRaw], requestId: body.requestId });
    if (!parsed.success) return errorResponse("รหัสนิสิตหรือคำขอไม่ถูกต้อง", 400);
    try {
      const result = await addParticipantsAndAward(activityId, BigInt(user.id), parsed.data);
      if (!result.added) return errorResponse("นิสิตคนนี้ลงทะเบียนกิจกรรมนี้แล้ว", 409);
      const created = await prisma.participation.findUnique({
        where: { activityId_userId: { activityId, userId: BigInt(targetIdRaw) } },
        include: { user: true, attendanceRecords: true, starTransactions: true },
      });
      return successResponse(created ? toParticipationDto(created) : null, 201);
    } catch (error) {
      if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
      return errorResponse("เพิ่มผู้เข้าร่วมไม่สำเร็จ กรุณาลองใหม่", 500);
    }
  }

  if (activity.status !== "PUBLISHED") {
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
    action: "participation.register",
    entityType: "Participation",
    entityId: activityId,
    details: { activityId: String(activityId), userId: String(userId) },
  });

  const created = await prisma.participation.findUnique({
    where: { activityId_userId: { activityId, userId } },
    include: { user: true, attendanceRecords: true, starTransactions: true },
  });

  return successResponse(created ? toParticipationDto(created) : null, 201);
}
