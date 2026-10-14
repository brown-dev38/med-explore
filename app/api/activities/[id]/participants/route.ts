import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { bulkParticipantSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เพิ่มผู้ลงทะเบียนแทน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const body = await req.json().catch(() => null);
  const parsed = bulkParticipantSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const userIds = parsed.data.userIds
    .map((value) => parseId(value))
    .filter((value): value is bigint => value !== null);
  if (userIds.length === 0) return errorResponse("ไม่พบผู้ใช้งาน", 400);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return errorResponse("ไม่พบผู้ใช้งาน", 400);

  const result = await prisma.participation.createMany({
    data: users.map((u) => ({
      activityId,
      userId: u.id,
      status: "REGISTERED" as const,
      eligibilityStatus: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "participation.add",
    entityType: "Participation",
    entityId: activityId,
    details: {
      activityId: String(activityId),
      requested: users.length,
      added: result.count,
    },
  });

  return successResponse(
    { added: result.count, requested: users.length },
    201,
  );
}
