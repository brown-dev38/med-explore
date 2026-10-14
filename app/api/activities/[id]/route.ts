import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { activityUpdateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toActivityDto } from "@/lib/activities";

type RouteContext = { params: Promise<{ id: string }> };

async function loadActivity(idParam: string) {
  const id = parseId(idParam);
  if (!id) return null;
  return prisma.activity.findUnique({ where: { id } });
}

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const { id } = await params;
  const activity = await loadActivity(id);
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const canManage = hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE);
  if (!canManage && activity.status !== "PUBLISHED") {
    return errorResponse("ไม่พบกิจกรรม", 404);
  }

  const [participantCount, mine] = await Promise.all([
    prisma.participation.count({ where: { activityId: activity.id } }),
    prisma.participation.findUnique({
      where: {
        activityId_userId: { activityId: activity.id, userId: BigInt(user.id) },
      },
      select: { id: true, status: true },
    }),
  ]);

  return successResponse({
    ...toActivityDto(activity),
    participantCount,
    myParticipation: mine
      ? { id: String(mine.id), status: mine.status }
      : null,
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์แก้ไขกิจกรรม", 403);
  }

  const { id } = await params;
  const current = await loadActivity(id);
  if (!current) return errorResponse("ไม่พบกิจกรรม", 404);

  const body = await req.json().catch(() => null);
  const parsed = activityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { title, description, location, startsAt, endsAt, minMinutes, status } =
    parsed.data;

  const editsDetails =
    title !== undefined ||
    description !== undefined ||
    location !== undefined ||
    startsAt !== undefined ||
    endsAt !== undefined ||
    minMinutes !== undefined;

  if (
    (current.status === "COMPLETED" || current.status === "CANCELLED") &&
    editsDetails
  ) {
    return errorResponse("กิจกรรมที่สิ้นสุดหรือถูกยกเลิกแล้วแก้ไขไม่ได้", 409);
  }

  const effectiveStart = startsAt ? new Date(startsAt) : current.startsAt;
  const effectiveEnd = endsAt ? new Date(endsAt) : current.endsAt;
  if (effectiveStart >= effectiveEnd) {
    return errorResponse("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น", 400);
  }

  const data: Prisma.ActivityUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description ?? null;
  if (location !== undefined) data.location = location ?? null;
  if (startsAt !== undefined) data.startsAt = new Date(startsAt);
  if (endsAt !== undefined) data.endsAt = new Date(endsAt);
  if (minMinutes !== undefined) data.minMinutes = minMinutes;
  if (status !== undefined) data.status = status;

  const updated = await prisma.activity.update({ where: { id: current.id }, data });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "activity.update",
    entityType: "Activity",
    entityId: updated.id,
    details: { title: updated.title, status: updated.status },
  });

  return successResponse(toActivityDto(updated));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ลบกิจกรรม", 403);
  }

  const { id } = await params;
  const current = await loadActivity(id);
  if (!current) return errorResponse("ไม่พบกิจกรรม", 404);

  if (current.status !== "DRAFT") {
    return errorResponse("ลบได้เฉพาะกิจกรรมที่เป็นฉบับร่างเท่านั้น", 409);
  }

  const participants = await prisma.participation.count({
    where: { activityId: current.id },
  });
  if (participants > 0) {
    return errorResponse("ไม่สามารถลบได้เนื่องจากมีผู้ลงทะเบียนแล้ว", 409);
  }

  await prisma.activity.delete({ where: { id: current.id } });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "activity.delete",
    entityType: "Activity",
    entityId: current.id,
    details: { title: current.title },
  });

  return successResponse({ id: String(current.id) });
}
