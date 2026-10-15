import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import {
  getHelpersForActivity,
  assignHelper,
  bulkAssignHelpers,
} from "@/lib/helpers";
import {
  helperAssignSchema,
  helperBulkAssignSchema,
} from "@/lib/validation";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ช่วยงาน", 403);
  }

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  try {
    const helpers = await getHelpersForActivity(activityId);
    return successResponse(helpers);
  } catch (error) {
    console.error("Failed to get helpers:", error);
    return errorResponse("ไม่สามารถดึงข้อมูลผู้ช่วยงานได้", 500);
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์มอบหมายผู้ช่วยงาน", 403);
  }

  const actorId = parseId(user.id);
  if (!actorId) return errorResponse("กรุณาเข้าสู่ระบบใหม่", 401);

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) return errorResponse("ไม่พบกิจกรรม", 404);

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
  });
  if (!activity) return errorResponse("ไม่พบกิจกรรม", 404);

  const json = await req.json().catch(() => null);

  try {
    // ตรวจสอบว่าเป็น bulk หรือ single
    if (json && Array.isArray(json.userIds)) {
      const parsed = helperBulkAssignSchema.safeParse(json);
      if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
      }

      const userIds = parsed.data.userIds
        .map(parseId)
        .filter((id): id is bigint => id !== null);

      const result = await bulkAssignHelpers(
        activityId,
        userIds,
        actorId,
        parsed.data.description,
      );

      return successResponse(result, 201);
    }

    const parsed = helperAssignSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
    }

    const targetUserId = parseId(parsed.data.userId);
    if (!targetUserId) return errorResponse("ไม่พบนิสิต", 400);

    // ตรวจสอบว่ามีผู้ช่วยงานคนนี้แล้วหรือไม่
    const existing = await prisma.helperAssignment.findUnique({
      where: {
        activityId_userId: {
          activityId,
          userId: targetUserId,
        },
      },
    });

    if (existing) {
      return errorResponse("นิสิตคนนี้ได้รับการมอบหมายเป็นผู้ช่วยงานแล้ว", 409);
    }

    const helper = await assignHelper(
      activityId,
      targetUserId,
      actorId,
      parsed.data.description,
    );

    return successResponse(helper, 201);
  } catch (error) {
    console.error("Assign helper error:", error);
    const msg = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการมอบหมายผู้ช่วยงาน";
    return errorResponse(msg, 500);
  }
}

