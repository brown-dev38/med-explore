import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api";
import { rewardIdSchema } from "@/lib/reward-validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  const parsed = rewardIdSchema.safeParse((await params).id);
  if (!parsed.success) return errorResponse("ไม่พบรูปภาพ", 404);
  const reward = await prisma.rewardTier.findFirst({
    where: { id: BigInt(parsed.data), deletedAt: null },
    select: { imageData: true, imageMimeType: true },
  });
  if (!reward?.imageData || reward.imageMimeType !== "image/webp") return errorResponse("ไม่พบรูปภาพ", 404);
  return new Response(new Uint8Array(reward.imageData), { headers: {
    "Content-Type": "image/webp", "Content-Length": String(reward.imageData.byteLength),
    "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
  } });
}
