import { successResponse } from "@/lib/api";
import { rewardActor, rewardRoute } from "@/lib/reward-api";
import { rewardCreateSchema, rewardIdSchema } from "@/lib/reward-validation";
import { createReward, rewardCatalog, RewardError } from "@/lib/rewards";
import { parseRewardBody } from "@/lib/reward-images";

export async function GET(request: Request) {
  return rewardRoute(async () => {
    await rewardActor("either");
    const parsed = rewardIdSchema.safeParse(new URL(request.url).searchParams.get("academicYearId"));
    if (!parsed.success) throw new RewardError("กรุณาเลือกปีการศึกษา", 400);
    return successResponse(await rewardCatalog(BigInt(parsed.data)));
  });
}

export async function POST(request: Request) {
  return rewardRoute(async () => {
    const { actor } = await rewardActor("staff");
    const { data, image } = await parseRewardBody(request);
    const parsed = rewardCreateSchema.safeParse(data);
    if (!parsed.success) throw new RewardError(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
    return successResponse(await createReward(parsed.data, BigInt(actor.id), image), 201);
  }, true);
}
