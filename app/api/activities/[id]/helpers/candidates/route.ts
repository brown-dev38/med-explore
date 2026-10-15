import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { getHelperCandidates } from "@/lib/helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ค้นหาผู้ช่วยงาน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  const candidates = await getHelperCandidates(activityId, q);

  return successResponse(candidates);
}

