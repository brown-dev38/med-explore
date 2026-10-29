import { getCurrentUser } from "@/lib/dal";
import { canViewStudents, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { bulkParticipantSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { addParticipantsAndAward } from "@/lib/activity-participants";
import { AttendanceError } from "@/lib/attendance";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canViewStudents(user) || !hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เพิ่มผู้ลงทะเบียนแทน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId || activityId > BigInt("9223372036854775807")) return errorResponse("ไม่พบกิจกรรม", 404);

  const body = await req.json().catch(() => null);
  const parsed = bulkParticipantSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    const result = await addParticipantsAndAward(activityId, BigInt(user.id), parsed.data);
    return successResponse(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
    return errorResponse("เพิ่มผู้เข้าร่วมไม่สำเร็จ กรุณาลองใหม่ด้วยรายชื่อเดิม", 500);
  }
}
