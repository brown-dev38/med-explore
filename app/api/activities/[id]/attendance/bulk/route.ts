import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { bulkAttendanceSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { AttendanceError, bulkRecordAttendance } from "@/lib/attendance";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE) && !hasPermission(user, PERMISSIONS.ATTENDANCE_RECORD)) {
    return errorResponse("ไม่มีสิทธิ์บันทึกเวลาแทน", 403);
  }
  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId || !(await prisma.activity.findUnique({ where: { id: activityId } }))) return errorResponse("ไม่พบกิจกรรม", 404);
  const parsed = bulkAttendanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  const checkInAt = parsed.data.checkInAt ? new Date(parsed.data.checkInAt) : null;
  try {
    return successResponse(await bulkRecordAttendance(activityId, BigInt(user.id), checkInAt, null));
  } catch (error) {
    if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
    if ((error as { code?: string }).code === "P2034") return errorResponse("มีการแก้ไขเวลาพร้อมกัน กรุณาลองใหม่", 409);
    console.error("Bulk attendance failed:", error);
    return errorResponse("บันทึกเวลาและดาวไม่สำเร็จ ข้อมูลยังไม่ถูกเปลี่ยน กรุณาลองใหม่", 500);
  }
}
