import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { hashQrToken } from "@/lib/qr";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) return errorResponse("ไม่มีสิทธิ์ดู QR", 403);
  const { id } = await params;
  const activityId = new URL(req.url).searchParams.get("activityId") ?? "";
  const token = req.headers.get("X-QR-Token");
  const sessionId = parseId(id);
  const parsedActivityId = parseId(activityId);
  const maxId = BigInt("9223372036854775807");
  if (!sessionId || sessionId > maxId || !parsedActivityId || parsedActivityId > maxId || !token || token.length > 256) {
    return errorResponse("ข้อมูล QR ไม่ถูกต้อง", 400);
  }
  const session = await prisma.qrSession.findFirst({
    where: { id: sessionId, activityId: parsedActivityId, tokenHash: hashQrToken(token), purpose: "CHECK_IN", revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, activityId: true, purpose: true, expiresAt: true },
  });
  return Response.json({ success: true, data: session ? {
    id: String(session.id), activityId: String(session.activityId), purpose: session.purpose, expiresAt: session.expiresAt.toISOString(),
  } : null }, { headers: { "Cache-Control": "private, no-store" } });
}

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
