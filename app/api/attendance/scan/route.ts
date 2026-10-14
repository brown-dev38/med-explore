import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { attendanceScanSchema } from "@/lib/validation";
import { errorResponse, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { hashQrToken } from "@/lib/qr";
import { AttendanceError, hasEvent, recordAttendance } from "@/lib/attendance";
import { toAttendanceDto } from "@/lib/participations";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const body = await req.json().catch(() => null);
  const parsed = attendanceScanSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const session = await prisma.qrSession.findFirst({
    where: {
      tokenHash: hashQrToken(parsed.data.token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!session) {
    return errorResponse("QR ไม่ถูกต้อง ถูกยกเลิก หรือหมดอายุแล้ว", 400);
  }

  const userId = BigInt(user.id);
  const participation = await prisma.participation.findUnique({
    where: {
      activityId_userId: { activityId: session.activityId, userId },
    },
  });
  if (!participation) {
    const activity = await prisma.activity.findUnique({
      where: { id: session.activityId },
      select: { id: true, title: true, status: true },
    });
    return NextResponse.json(
      {
        message: "คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้",
        code: "NOT_REGISTERED",
        activity: activity
          ? {
              id: String(activity.id),
              title: activity.title,
              status: activity.status,
            }
          : null,
      },
      { status: 400 },
    );
  }

  if (
    session.purpose === "CHECK_OUT" &&
    !(await hasEvent(participation.id, "CHECK_IN"))
  ) {
    return errorResponse("ยังไม่พบการเช็คอิน ไม่สามารถเช็คเอาท์ได้", 400);
  }

  let record;
  try {
    record = await recordAttendance({
      participationId: participation.id,
      eventType: session.purpose,
      method: "QR",
      occurredAt: new Date(),
      recordedBy: userId,
    });
  } catch (error) {
    if (error instanceof AttendanceError) {
      return errorResponse(error.message, error.status);
    }
    throw error;
  }

  await recordAudit({
    actorId: userId,
    action: "attendance.record",
    entityType: "AttendanceRecord",
    entityId: record.id,
    details: {
      activityId: String(session.activityId),
      eventType: session.purpose,
      method: "QR",
    },
  });

  return successResponse(
    { ...toAttendanceDto(record), activityId: String(session.activityId) },
    201,
  );
}
