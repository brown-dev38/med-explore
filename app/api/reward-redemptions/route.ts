import { successResponse } from "@/lib/api";
import { rewardActor, rewardRoute } from "@/lib/reward-api";
import { redemptionCreateSchema } from "@/lib/reward-validation";
import { requestRedemption, RewardError } from "@/lib/rewards";

export async function POST(request: Request) {
  return rewardRoute(async () => {
    const { actor } = await rewardActor("student");
    const parsed = redemptionCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new RewardError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
    const result = await requestRedemption(parsed.data, BigInt(actor.id));
    return successResponse(result, result.replayed ? 200 : 201);
  }, true);
}
