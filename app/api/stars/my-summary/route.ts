import { getCurrentUser } from "@/lib/dal";
import { errorResponse, successResponse } from "@/lib/api";
import { getStudentStarSummary } from "@/lib/helpers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const summary = await getStudentStarSummary(BigInt(user.id));
  return successResponse(summary);
}

