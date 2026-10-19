import { successResponse } from "@/lib/api";
import { rewardActor, rewardRoute } from "@/lib/reward-api";
import { rewardIdSchema, rewardUpdateSchema } from "@/lib/reward-validation";
import { updateReward, deleteReward, RewardError } from "@/lib/rewards";
import { parseRewardBody } from "@/lib/reward-images";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return rewardRoute(async () => {
    const { actor } = await rewardActor("staff");
    const id = rewardIdSchema.safeParse((await params).id);
    const { data, image } = await parseRewardBody(request);
    const input = rewardUpdateSchema.safeParse(data);
    if (!id.success || !input.success) throw new RewardError(!input.success ? input.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" : "รหัสไม่ถูกต้อง", 400);
    return successResponse(await updateReward(BigInt(id.data), input.data, BigInt(actor.id), image));
  }, true);
}

export async function DELETE(_request: Request, { params }: Context) {
  return rewardRoute(async () => {
    const { actor } = await rewardActor("staff");
    const id = rewardIdSchema.safeParse((await params).id);
    if (!id.success) throw new RewardError("รหัสไม่ถูกต้อง", 400);
    return successResponse(await deleteReward(BigInt(id.data), BigInt(actor.id)));
  }, true);
}
