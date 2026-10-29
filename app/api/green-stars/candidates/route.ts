import { getCurrentUser } from "@/lib/dal";
import { canManageGreenStars } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { getStandaloneGreenStarCandidates } from "@/lib/green-star-work";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canManageGreenStars(actor)) return errorResponse("ไม่มีสิทธิ์ค้นหานิสิต", 403);
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  return successResponse(await getStandaloneGreenStarCandidates(query));
}
