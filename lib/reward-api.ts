import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { canManageRewards, hasRole, ROLES } from "@/lib/permissions";
import { errorResponse } from "@/lib/api";
import { RewardError } from "@/lib/rewards";

export async function rewardActor(access: "staff" | "student" | "either") {
  const actor = await getCurrentUser();
  if (!actor) throw new RewardError("กรุณาเข้าสู่ระบบ", 401);
  const staff = canManageRewards(actor);
  const student = hasRole(actor, ROLES.STUDENT);
  if ((access === "staff" && !staff) || (access === "student" && !student) || (access === "either" && !staff && !student)) {
    throw new RewardError("ไม่มีสิทธิ์ใช้งานระบบรางวัล", 403);
  }
  return { actor, staff };
}

export async function rewardRoute(work: () => Promise<Response>, mutate = false) {
  try {
    const response = await work();
    if (mutate && response.ok) {
      for (const area of ["admin", "organizer", "dashboard"]) {
        revalidatePath(`/${area}/rewards`);
        revalidatePath(`/${area}/redemptions`);
      }
      revalidatePath("/dashboard");
    }
    return response;
  } catch (error) {
    if (error instanceof RewardError) return errorResponse(error.message, error.status);
    const code = (error as { code?: string }).code;
    if (code === "P2002") return errorResponse("ชื่อรางวัลหรือคำขอนี้มีอยู่แล้ว กรุณาตรวจสอบรายการ", 409);
    if (code === "P2025") return errorResponse("ไม่พบรายการ หรือรายการถูกแก้ไขไปแล้ว", 404);
    console.error("Reward operation failed", error);
    return errorResponse("ดำเนินการไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
