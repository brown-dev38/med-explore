import type { AcademicYearStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { academicYearCreateSchema } from "@/lib/validation";
import { errorResponse, successResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { AcademicYearError, setActiveAcademicYear, toAcademicYearDto } from "@/lib/academic-years";

const VALID_STATUS: AcademicYearStatus[] = ["DRAFT", "ACTIVE", "CLOSED"];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACADEMIC_YEAR_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้", 403);
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const where =
    statusParam && VALID_STATUS.includes(statusParam as AcademicYearStatus)
      ? { status: statusParam as AcademicYearStatus }
      : undefined;

  const years = await prisma.academicYear.findMany({
    where,
    orderBy: { startsOn: "desc" },
  });

  return successResponse(years.map(toAcademicYearDto));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACADEMIC_YEAR_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ดำเนินการ", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = academicYearCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { code, startsOn, endsOn, status } = parsed.data;

  const existing = await prisma.academicYear.findUnique({ where: { code } });
  if (existing) {
    return errorResponse("รหัสปีการศึกษานี้มีอยู่แล้ว", 409);
  }

  const created = await prisma.academicYear.create({
    data: {
      code,
      startsOn: new Date(startsOn),
      endsOn: new Date(endsOn),
      status: "DRAFT",
    },
  });

  let finalYear = created;
  try {
    if (status === "ACTIVE") finalYear = await setActiveAcademicYear(created.id, BigInt(user.id));
  } catch (error) {
    if (error instanceof AcademicYearError) return errorResponse(error.message, error.status);
    console.error("Academic year activation failed:", error);
    return errorResponse("สร้างฉบับร่างแล้ว แต่เปิดใช้งานไม่สำเร็จ กรุณาลองเปิดใช้งานอีกครั้ง", 500);
  }

  await recordAudit({
    actorId: BigInt(user.id),
    action: "academic_year.create",
    entityType: "AcademicYear",
    entityId: finalYear.id,
    details: { code: finalYear.code, status: finalYear.status },
  });

  if (status === "ACTIVE") {
    for (const area of ["admin", "organizer", "dashboard"]) revalidatePath(`/${area}`, "layout");
  }

  return successResponse(toAcademicYearDto(finalYear), 201);
}
