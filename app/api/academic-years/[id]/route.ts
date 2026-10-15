import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { deleteAcademicYear, DeletionError } from "@/lib/admin-deletion";
import { academicYearUpdateSchema } from "@/lib/validation";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { toAcademicYearDto } from "@/lib/academic-years";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACADEMIC_YEAR_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้", 403);
  }

  const { id } = await params;
  const yearId = parseId(id);
  if (!yearId) return errorResponse("ไม่พบข้อมูล", 404);

  const year = await prisma.academicYear.findUnique({ where: { id: yearId } });
  if (!year) return errorResponse("ไม่พบข้อมูล", 404);

  return successResponse(toAcademicYearDto(year));
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACADEMIC_YEAR_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ดำเนินการ", 403);
  }

  const { id } = await params;
  const yearId = parseId(id);
  if (!yearId) return errorResponse("ไม่พบข้อมูล", 404);

  const current = await prisma.academicYear.findUnique({ where: { id: yearId } });
  if (!current) return errorResponse("ไม่พบข้อมูล", 404);

  const body = await req.json().catch(() => null);
  const parsed = academicYearUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { code, startsOn, endsOn, status } = parsed.data;

  const editsDetails = code !== undefined || startsOn !== undefined || endsOn !== undefined;
  const reopening = status !== undefined && status !== "CLOSED";
  if (current.status === "CLOSED" && editsDetails && !reopening) {
    return errorResponse("ปีการศึกษาที่ปิดแล้วไม่สามารถแก้ไขได้", 409);
  }

  const effectiveStart = startsOn ?? current.startsOn.toISOString().slice(0, 10);
  const effectiveEnd = endsOn ?? current.endsOn.toISOString().slice(0, 10);
  if (effectiveStart >= effectiveEnd) {
    return errorResponse("วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด", 400);
  }

  if (code !== undefined && code !== current.code) {
    const duplicate = await prisma.academicYear.findUnique({ where: { code } });
    if (duplicate) return errorResponse("รหัสปีการศึกษานี้มีอยู่แล้ว", 409);
  }

  const data: Prisma.AcademicYearUpdateInput = {};
  if (code !== undefined) data.code = code;
  if (startsOn !== undefined) data.startsOn = new Date(startsOn);
  if (endsOn !== undefined) data.endsOn = new Date(endsOn);
  if (status !== undefined) data.status = status;

  const updated = await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE") {
      await tx.academicYear.updateMany({
        where: { status: "ACTIVE", id: { not: yearId } },
        data: { status: "CLOSED" },
      });
    }
    return tx.academicYear.update({ where: { id: yearId }, data });
  });

  await recordAudit({
    actorId: BigInt(user.id),
    action: "academic_year.update",
    entityType: "AcademicYear",
    entityId: updated.id,
    details: { code: updated.code, status: updated.status },
  });

  return successResponse(toAcademicYearDto(updated));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasRole(user, ROLES.ADMIN)) {
    return errorResponse("ไม่มีสิทธิ์ดำเนินการ", 403);
  }

  const { id } = await params;
  const yearId = parseId(id);
  if (!yearId) return errorResponse("ไม่พบข้อมูล", 404);

  try {
    return successResponse(await deleteAcademicYear(yearId, BigInt(user.id)));
  } catch (error) {
    if (error instanceof DeletionError) return errorResponse(error.message, error.status);
    return errorResponse("ลบปีการศึกษาไม่สำเร็จ ข้อมูลยังไม่ถูกลบ กรุณาลองใหม่", 500);
  }
}
