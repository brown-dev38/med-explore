import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { attendanceTransaction, recalculateActivityAttendance } from "@/lib/attendance";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) return errorResponse("ไม่มีสิทธิ์คำนวณเวลาและดาว", 403);
  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId || !(await prisma.activity.findUnique({ where: { id: activityId } }))) return errorResponse("ไม่พบกิจกรรม", 404);
  try {
    return successResponse(await attendanceTransaction((tx) => recalculateActivityAttendance(tx, activityId, BigInt(user.id))));
  } catch (error) {
    console.error("Attendance recalculation failed:", error);
    return errorResponse("คำนวณเวลาและดาวไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
