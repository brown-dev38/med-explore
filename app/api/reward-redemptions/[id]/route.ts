import { successResponse } from "@/lib/api";
import { rewardActor, rewardRoute } from "@/lib/reward-api";
import { redemptionReviewSchema, rewardIdSchema } from "@/lib/reward-validation";
import { reviewRedemption, RewardError } from "@/lib/rewards";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return rewardRoute(async () => {
    const { actor, staff } = await rewardActor("either");
    const id = rewardIdSchema.safeParse((await params).id);
    const input = redemptionReviewSchema.safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) throw new RewardError(!input.success ? input.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" : "รหัสไม่ถูกต้อง", 400);
    if (!staff && input.data.status !== "CANCELLED") throw new RewardError("นิสิตยกเลิกได้เฉพาะคำขอของตนเองที่รออนุมัติ", 403);
    return successResponse(await reviewRedemption(BigInt(id.data), input.data, BigInt(actor.id)));
  }, true);
}
