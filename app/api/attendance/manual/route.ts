import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { attendanceManualSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { AttendanceError, recordAttendance } from "@/lib/attendance";
import { toAttendanceDto } from "@/lib/participations";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE) && !hasPermission(user, PERMISSIONS.ATTENDANCE_RECORD)) {
    return errorResponse("ไม่มีสิทธิ์บันทึกเวลาแทน", 403);
  }
  const parsed = attendanceManualSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  const participationId = parseId(parsed.data.participationId);
  if (!participationId) return errorResponse("ไม่พบผู้เข้าร่วม", 404);
  try {
    const result = await recordAttendance({
      participationId, eventType: parsed.data.eventType, method: "ORGANIZER",
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
      recordedBy: BigInt(user.id), replaceExisting: true,
    });
    return successResponse({ ...toAttendanceDto(result.record), evaluation: result.evaluation }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
    if ((error as { code?: string }).code === "P2034") return errorResponse("มีการแก้ไขเวลาพร้อมกัน กรุณาลองใหม่", 409);
    console.error("Manual attendance failed:", error);
    return errorResponse("บันทึกเวลาและดาวไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
