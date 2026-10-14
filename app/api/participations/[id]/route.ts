import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const { id } = await params;
  const participationId = parseId(id);
  if (!participationId) return errorResponse("ไม่พบข้อมูลการลงทะเบียน", 404);

  const participation = await prisma.participation.findUnique({
    where: { id: participationId },
  });
  if (!participation) return errorResponse("ไม่พบข้อมูลการลงทะเบียน", 404);

  const isOwner = participation.userId === BigInt(user.id);
  const canManage = hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE);
  if (!isOwner && !canManage) {
    return errorResponse("ไม่มีสิทธิ์ยกเลิกการลงทะเบียนนี้", 403);
  }

  const attendanceCount = await prisma.attendanceRecord.count({
    where: { participationId },
  });
  if (attendanceCount > 0) {
    return errorResponse("มีบันทึกการเข้างานแล้ว ไม่สามารถยกเลิกได้", 409);
  }

  await prisma.participation.delete({ where: { id: participationId } });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "participation.unregister",
    entityType: "Participation",
    entityId: participationId,
    details: { activityId: String(participation.activityId) },
  });

  return successResponse({ id: String(participationId) });
}
