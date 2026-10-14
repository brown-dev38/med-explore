import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { bulkAttendanceSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const canManage = hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE);
  const canRecord = hasPermission(user, PERMISSIONS.ATTENDANCE_RECORD);
  if (!canManage && !canRecord) {
    return errorResponse("ไม่มีสิทธิ์บันทึกเวลาแทน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const body = await req.json().catch(() => null);
  const parsed = bulkAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const checkInAt = parsed.data.checkInAt
    ? new Date(parsed.data.checkInAt)
    : null;
  const checkOutAt = parsed.data.checkOutAt
    ? new Date(parsed.data.checkOutAt)
    : null;
  const recordedBy = BigInt(user.id);

  const participations = await prisma.participation.findMany({
    where: { activityId },
    select: { id: true },
  });

  let updated = 0;
  let skippedCheckOut = 0;

  await prisma.$transaction(async (tx) => {
    for (const participation of participations) {
      const participationId = participation.id;
      let hasCheckIn = false;
      let touched = false;

      if (checkInAt) {
        await tx.attendanceRecord.upsert({
          where: {
            participationId_eventType: {
              participationId,
              eventType: "CHECK_IN",
            },
          },
          update: { occurredAt: checkInAt, recordedBy },
          create: {
            participationId,
            eventType: "CHECK_IN",
            method: "ORGANIZER",
            occurredAt: checkInAt,
            recordedBy,
          },
        });
        hasCheckIn = true;
        touched = true;
      } else {
        const count = await tx.attendanceRecord.count({
          where: { participationId, eventType: "CHECK_IN" },
        });
        hasCheckIn = count > 0;
      }

      if (checkOutAt) {
        if (hasCheckIn) {
          await tx.attendanceRecord.upsert({
            where: {
              participationId_eventType: {
                participationId,
                eventType: "CHECK_OUT",
              },
            },
            update: { occurredAt: checkOutAt, recordedBy },
            create: {
              participationId,
              eventType: "CHECK_OUT",
              method: "ORGANIZER",
              occurredAt: checkOutAt,
              recordedBy,
            },
          });
          touched = true;
        } else {
          skippedCheckOut += 1;
        }
      }

      if (touched) updated += 1;
    }
  });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "attendance.bulk",
    entityType: "Activity",
    entityId: activityId,
    details: {
      checkInAt: checkInAt ? checkInAt.toISOString() : null,
      checkOutAt: checkOutAt ? checkOutAt.toISOString() : null,
      participants: participations.length,
      updated,
      skippedCheckOut,
    },
  });

  return successResponse({
    participants: participations.length,
    updated,
    skippedCheckOut,
  });
}
