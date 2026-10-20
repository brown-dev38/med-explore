import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { deleteActivity, DeletionError } from "@/lib/admin-deletion";
import { activityUpdateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { toActivityDto } from "@/lib/activities";
import { AttendanceError, attendanceTransaction, recalculateActivityAttendance } from "@/lib/attendance";

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

  const editsSchedule = startsAt !== undefined || endsAt !== undefined || minMinutes !== undefined;
  if (editsSchedule && !hasRole(user, ROLES.ADMIN) && !hasRole(user, ROLES.ORGANIZER)) {
    return errorResponse("เฉพาะผู้ดูแลและผู้จัดกิจกรรมเท่านั้นที่แก้ไขเวลาและเกณฑ์ขั้นต่ำได้", 403);
  }
  if (editsSchedule && current.status !== "DRAFT") {
    return errorResponse("แก้ไขเวลาและเกณฑ์ขั้นต่ำได้เฉพาะกิจกรรมฉบับร่างเท่านั้น", 409);
  }

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

  try {
    const updated = await attendanceTransaction(async (tx) => {
      if (status === "PUBLISHED" && effectiveEnd <= new Date()) {
        throw new AttendanceError("กิจกรรมเลยเวลาสิ้นสุดแล้ว กรุณาแก้ไขเวลาก่อนเปิดรับลงทะเบียน", 409);
      }
      const activity = await tx.activity.update({
        where: {
          id: current.id,
          // Keep the validated status and timing values consistent with concurrent edits.
          ...(editsSchedule || status === "PUBLISHED" ? { status: current.status, startsAt: current.startsAt, endsAt: current.endsAt, minMinutes: current.minMinutes } : {}),
        },
        data,
      });
      if (minMinutes !== undefined || status !== undefined) {
        await recalculateActivityAttendance(tx, current.id, BigInt(user.id));
      }
      await tx.auditLog.create({ data: {
        actorId: BigInt(user.id), action: "activity.update", entityType: "Activity", entityId: activity.id,
        details: {
          title: activity.title, status: activity.status,
          ...(editsSchedule ? {
            previousStartsAt: current.startsAt.toISOString(), previousEndsAt: current.endsAt.toISOString(),
            startsAt: activity.startsAt.toISOString(), endsAt: activity.endsAt.toISOString(),
            previousMinMinutes: current.minMinutes, minMinutes: activity.minMinutes,
          } : {}),
        },
      } });
      return activity;
    });
    return successResponse(toActivityDto(updated));
  } catch (error) {
    if ((editsSchedule || status === "PUBLISHED") && (error as { code?: string }).code === "P2025") {
      return errorResponse("สถานะ เวลา หรือเกณฑ์ขั้นต่ำเปลี่ยนไปแล้ว กรุณารีเฟรชและลองใหม่", 409);
    }
    if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
    console.error("Activity update failed:", error);
    return errorResponse("แก้ไขกิจกรรมและคำนวณดาวไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  const isAdmin = hasRole(user, ROLES.ADMIN);
  if (!isAdmin && !hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ลบกิจกรรม", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);
  try {
    return successResponse(await deleteActivity(activityId, BigInt(user.id), isAdmin));
  } catch (error) {
    if (error instanceof DeletionError) return errorResponse(error.message, error.status);
    return errorResponse("ลบกิจกรรมไม่สำเร็จ ข้อมูลยังไม่ถูกลบ กรุณาลองใหม่", 500);
  }
}
