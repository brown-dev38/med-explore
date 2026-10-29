import { getCurrentUser } from "@/lib/dal";
import { canManageGreenStars } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { greenWorkAwardSchema, greenWorkBulkAwardSchema } from "@/lib/validation";
import { awardStandaloneGreenStar, awardStandaloneGreenStars, GreenStarWorkError } from "@/lib/green-star-work";

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canManageGreenStars(actor)) return errorResponse("ไม่มีสิทธิ์ให้ดาวสีเขียว", 403);
  const body = await request.json().catch(() => null);
  try {
    if (body && typeof body === "object" && "userIds" in body) {
      const parsed = greenWorkBulkAwardSchema.safeParse(body);
      if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
      const result = await awardStandaloneGreenStars(parsed.data, BigInt(actor.id));
      return successResponse(result, result.replayed ? 200 : 201);
    }
    const parsed = greenWorkAwardSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
    const result = await awardStandaloneGreenStar(parsed.data, BigInt(actor.id));
    return successResponse(result, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof GreenStarWorkError) return errorResponse(error.message, error.status);
    return errorResponse("บันทึกดาวสีเขียวไม่สำเร็จ กรุณาลองใหม่ด้วยข้อมูลเดิม", 500);
  }
}
