import type { ActivityStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { activityCreateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toActivityDto } from "@/lib/activities";

const VALID_STATUS: ActivityStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "COMPLETED",
  "CANCELLED",
];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);

  const canManage = hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE);
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const academicYearIdParam = searchParams.get("academicYearId");

  const where: Prisma.ActivityWhereInput = {};
  if (!canManage) {
    where.status = "PUBLISHED";
  } else if (statusParam && VALID_STATUS.includes(statusParam as ActivityStatus)) {
    where.status = statusParam as ActivityStatus;
  }
  if (academicYearIdParam) {
    const academicYearId = parseId(academicYearIdParam);
    if (academicYearId) where.academicYearId = academicYearId;
  }

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { startsAt: canManage ? "desc" : "asc" },
    include: { _count: { select: { participations: true } } },
  });

  const myParticipations = await prisma.participation.findMany({
    where: {
      userId: BigInt(user.id),
      activityId: { in: activities.map((activity) => activity.id) },
    },
    select: { id: true, activityId: true, status: true, attendanceRecords: { select: { eventType: true, occurredAt: true } } },
  });
  const participationByActivity = new Map(
    myParticipations.map((p) => [String(p.activityId), p]),
  );

  const data = activities.map((activity) => {
    const mine = participationByActivity.get(String(activity.id));
    return {
      ...toActivityDto(activity),
      participantCount: activity._count.participations,
      myParticipation: mine
        ? {
            id: String(mine.id), status: mine.status,
            checkInAt: mine.attendanceRecords.find((record) => record.eventType === "CHECK_IN")?.occurredAt.toISOString() ?? null,
            checkOutAt: mine.attendanceRecords.find((record) => record.eventType === "CHECK_OUT")?.occurredAt.toISOString() ?? null,
          }
        : null,
    };
  });

  const response = successResponse(data);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์สร้างกิจกรรม", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = activityCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { title, description, location, startsAt, endsAt } =
    parsed.data;

  let academicYearId: bigint | null = null;
  if (parsed.data.academicYearId) {
    const provided = parseId(parsed.data.academicYearId);
    if (!provided) return errorResponse("ไม่พบปีการศึกษา", 400);
    const year = await prisma.academicYear.findUnique({ where: { id: provided } });
    if (!year) return errorResponse("ไม่พบปีการศึกษา", 400);
    academicYearId = year.id;
  } else {
    const active = await prisma.academicYear.findFirst({
      where: { status: "ACTIVE" },
    });
    if (!active) {
      return errorResponse("ยังไม่มีปีการศึกษาที่เปิดใช้งาน", 400);
    }
    academicYearId = active.id;
  }

  const activity = await prisma.activity.create({
    data: {
      academicYearId,
      organizerId: BigInt(user.id),
      title,
      description: description ?? null,
      location: location ?? null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      status: "DRAFT",
    },
  });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "activity.create",
    entityType: "Activity",
    entityId: activity.id,
    details: { title: activity.title },
  });

  return successResponse(toActivityDto(activity), 201);
}
