import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { attendanceScanSchema } from "@/lib/validation";
import { errorResponse, successResponse } from "@/lib/api";
import { hashQrToken } from "@/lib/qr";
import { AttendanceError, recordAttendance } from "@/lib/attendance";
import { toAttendanceDto } from "@/lib/participations";
import { scheduleAttendanceReview } from "@/lib/attendance-worker";

async function findQrSession(token: string) {
  return prisma.qrSession.findFirst({
    where: { tokenHash: hashQrToken(token), purpose: "CHECK_IN", revokedAt: null, expiresAt: { gt: new Date() } },
    include: { activity: { select: { id: true, title: true, status: true, academicYearId: true, academicYear: { select: { status: true } } } } },
  });
}

function validateSessionYear(session: NonNullable<Awaited<ReturnType<typeof findQrSession>>>, academicYearId?: string) {
  if (academicYearId && session.activity.academicYearId !== BigInt(academicYearId)) {
    return errorResponse("QR นี้เป็นกิจกรรมคนละปีการศึกษากับปีที่เลือก กรุณาตรวจสอบ QR Code", 409);
  }
  if (session.activity.academicYear.status !== "ACTIVE") {
    return errorResponse(session.activity.academicYear.status === "CLOSED"
      ? "ปีการศึกษาของกิจกรรมนี้ปิดแล้ว ไม่สามารถเช็คอินหรือเช็คเอาท์ได้"
      : "ปีการศึกษาของกิจกรรมนี้ยังไม่เปิดใช้งาน", 409);
  }
  return null;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  const params = new URL(req.url).searchParams;
  const parsed = attendanceScanSchema.safeParse({ token: params.get("token"), academicYearId: params.get("academicYearId") ?? undefined });
  if (!parsed.success) return errorResponse("ไม่พบรหัส QR ที่ถูกต้อง", 400);
  const session = await findQrSession(parsed.data.token);
  if (!session) return errorResponse("QR ไม่ถูกต้อง ถูกยกเลิก หรือหมดอายุแล้ว", 400);
  const yearError = validateSessionYear(session, parsed.data.academicYearId);
  if (yearError) return yearError;
  return NextResponse.json({ success: true, data: { purpose: session.purpose } }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

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

  const session = await findQrSession(parsed.data.token);
  if (!session) {
    return errorResponse("QR ไม่ถูกต้อง ถูกยกเลิก หรือหมดอายุแล้ว", 400);
  }
  const yearError = validateSessionYear(session, parsed.data.academicYearId);
  if (yearError) return yearError;

  const userId = BigInt(user.id);
  const participation = await prisma.participation.findUnique({
    where: {
      activityId_userId: { activityId: session.activityId, userId },
    },
  });
  if (!participation) {
    const activity = session.activity;
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

  let result;
  try {
    result = await recordAttendance({
      participationId: participation.id,
      eventType: session.purpose,
      method: "QR",
      occurredAt: new Date(),
      recordedBy: userId,
      qrSessionId: session.id,
    });
  } catch (error) {
    if (error instanceof AttendanceError) {
      return errorResponse(error.message, error.status);
    }
    if ((error as { code?: string }).code === "P2034") return errorResponse("มีการลงเวลาพร้อมกัน กรุณาลองอีกครั้ง", 409);
    console.error("Attendance scan failed:", error);
    return errorResponse("บันทึกเวลาและดาวไม่สำเร็จ กรุณาลองใหม่", 500);
  }

  scheduleAttendanceReview(session.expiresAt);
  return successResponse(
    { ...toAttendanceDto(result.record), activityId: String(session.activityId), evaluation: result.evaluation },
    201,
  );
}
