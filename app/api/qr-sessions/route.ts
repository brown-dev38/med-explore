import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { qrSessionCreateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { generateQrToken, hashQrToken } from "@/lib/qr";

const DEFAULT_TTL_MINUTES = 15;

function getRequestOrigin(req: Request): string {
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.host) return url.origin;
    } catch {
      // ignore malformed referer
    }
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์สร้าง QR", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = qrSessionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const activityId = parseId(parsed.data.activityId);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const ttlMinutes = parsed.data.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const token = generateQrToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const session = await prisma.qrSession.create({
    data: {
      activityId,
      createdBy: BigInt(user.id),
      purpose: parsed.data.purpose,
      tokenHash: hashQrToken(token),
      expiresAt,
    },
  });

  const origin = getRequestOrigin(req);
  const scanUrl = `${origin}/scan?token=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, { width: 1024, margin: 4 });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "qr_session.create",
    entityType: "QrSession",
    entityId: session.id,
    details: {
      activityId: String(activityId),
      purpose: parsed.data.purpose,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return successResponse(
    {
      id: String(session.id),
      activityId: String(activityId),
      purpose: session.purpose,
      expiresAt: expiresAt.toISOString(),
      token,
      scanUrl,
      qrDataUrl,
    },
    201,
  );
}
