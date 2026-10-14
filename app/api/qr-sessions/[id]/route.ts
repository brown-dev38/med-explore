import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ปิด QR", 403);
  }

  const { id } = await params;
  const sessionId = parseId(id);
  if (!sessionId) return errorResponse("ไม่พบ QR", 404);

  const session = await prisma.qrSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) return errorResponse("ไม่พบ QR", 404);

  if (!session.revokedAt) {
    await prisma.qrSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    await recordAudit({
      actorId: BigInt(user.id),
      action: "qr_session.revoke",
      entityType: "QrSession",
      entityId: sessionId,
      details: { activityId: String(session.activityId) },
    });
  }

  return successResponse({ id: String(sessionId) });
}
