import { getCurrentUser } from "@/lib/dal";
import { canManageGreenStars, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/request-origin";
import { greenStarImportSchema, greenStarImportTargetSchema, MAX_STUDENT_IMPORT_BYTES } from "@/lib/green-star-import-schema";
import { readStudentExcel, StudentExcelError } from "@/lib/student-excel";
import { confirmGreenStarImport, previewGreenStarImport, GreenStarImportError } from "@/lib/green-star-import";

function importError(error: unknown) {
  if (error instanceof GreenStarImportError) return errorResponse(error.message, error.status);
  if (error instanceof StudentExcelError) return errorResponse(error.message, 400);
  return errorResponse("นำเข้าไม่สำเร็จ กรุณาลองใหม่ด้วยข้อมูลเดิม", 500);
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canManageGreenStars(actor)) return errorResponse("ไม่มีสิทธิ์นำเข้ารายชื่อ", 403);
  if (!isSameOriginRequest(request)) return errorResponse("กรุณานำเข้าจากหน้าเว็บไซต์ของระบบ", 403);
  const form = await request.formData().catch(() => null);
  if (!form) return errorResponse("ข้อมูลไฟล์ไม่ถูกต้อง", 400);
  const target = greenStarImportTargetSchema.safeParse({ mode: form.get("mode"), academicYearId: form.get("academicYearId"), activityId: form.get("activityId") });
  if (!target.success) return errorResponse("กรุณาเลือกปีการศึกษาและกิจกรรมให้ถูกต้อง", 400);
  if (target.data.mode === "activity" && !hasPermission(actor, PERMISSIONS.ACTIVITY_MANAGE)) return errorResponse("ไม่มีสิทธิ์จัดการผู้ช่วยงาน", 403);
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return errorResponse("กรุณาเลือกไฟล์ Excel .xlsx", 400);
  if (!file.size || file.size > MAX_STUDENT_IMPORT_BYTES) return errorResponse("ไฟล์ต้องมีขนาดไม่เกิน 5 MB และไม่เป็นไฟล์ว่าง", 400);
  try {
    const rows = await readStudentExcel(await file.arrayBuffer());
    const result = await previewGreenStarImport(target.data, rows);
    const response = successResponse({ rows: result });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return importError(error); }
}

export async function PUT(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canManageGreenStars(actor)) return errorResponse("ไม่มีสิทธิ์นำเข้ารายชื่อ", 403);
  if (!isSameOriginRequest(request)) return errorResponse("กรุณานำเข้าจากหน้าเว็บไซต์ของระบบ", 403);
  const parsed = greenStarImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  if (parsed.data.target.mode === "activity" && !hasPermission(actor, PERMISSIONS.ACTIVITY_MANAGE)) return errorResponse("ไม่มีสิทธิ์จัดการผู้ช่วยงาน", 403);
  try {
    const result = await confirmGreenStarImport(parsed.data, BigInt(actor.id));
    return successResponse(result, result.replayed ? 200 : 201);
  } catch (error) { return importError(error); }
}
