import { getCurrentUser } from "@/lib/dal";
import { canViewStudents, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { AttendanceError } from "@/lib/attendance";
import { cancelParticipantYellowStar } from "@/lib/activity-participants";

type Context = { params: Promise<{ id: string; participationId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canViewStudents(actor) || !hasPermission(actor, PERMISSIONS.ACTIVITY_MANAGE)) return errorResponse("ไม่มีสิทธิ์ยกเลิกการให้ดาว", 403);
  const { id, participationId: rawParticipationId } = await params;
  const activityId = parseId(id);
  const participationId = parseId(rawParticipationId);
  const maxId = BigInt("9223372036854775807");
  if (!activityId || !participationId || activityId > maxId || participationId > maxId) return errorResponse("ไม่พบผู้เข้าร่วมในกิจกรรมนี้", 404);
  try {
    return successResponse(await cancelParticipantYellowStar(activityId, participationId, BigInt(actor.id)));
  } catch (error) {
    if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
    return errorResponse("ยกเลิกการให้ดาวไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
