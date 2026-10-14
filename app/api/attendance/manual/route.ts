import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { attendanceManualSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { hasEvent } from "@/lib/attendance";
import { toAttendanceDto } from "@/lib/participations";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const canManage = hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE);
  const canRecord = hasPermission(user, PERMISSIONS.ATTENDANCE_RECORD);
  if (!canManage && !canRecord) {
    return errorResponse("ไม่มีสิทธิ์บันทึกเวลาแทน", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = attendanceManualSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const participationId = parseId(parsed.data.participationId);
  if (!participationId) return errorResponse("ไม่พบผู้เข้าร่วม", 404);

  const participation = await prisma.participation.findUnique({
    where: { id: participationId },
  });
  if (!participation) return errorResponse("ไม่พบผู้เข้าร่วม", 404);

  const { eventType } = parsed.data;
  if (eventType === "CHECK_OUT" && !(await hasEvent(participationId, "CHECK_IN"))) {
    return errorResponse("ยังไม่พบการเช็คอิน ไม่สามารถบันทึกเช็คเอาท์ได้", 400);
  }

  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : new Date();

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      participationId_eventType: { participationId, eventType },
    },
  });

  const record = existing
    ? await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { occurredAt, recordedBy: BigInt(user.id) },
      })
    : await prisma.attendanceRecord.create({
        data: {
          participationId,
          eventType,
          method: "ORGANIZER",
          occurredAt,
          recordedBy: BigInt(user.id),
        },
      });

  await recordAudit({
    actorId: BigInt(user.id),
    action: existing ? "attendance.update" : "attendance.record",
    entityType: "AttendanceRecord",
    entityId: record.id,
    details: {
      activityId: String(participation.activityId),
      eventType,
      method: "ORGANIZER",
    },
  });

  return successResponse(toAttendanceDto(record), existing ? 200 : 201);
}
