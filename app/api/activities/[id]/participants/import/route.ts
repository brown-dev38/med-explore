import { getCurrentUser } from "@/lib/dal";
import { canViewStudents, hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/request-origin";
import { MAX_STUDENT_IMPORT_BYTES } from "@/lib/green-star-import-schema";
import { participantImportSchema } from "@/lib/participant-import-schema";
import { readStudentExcel, StudentExcelError } from "@/lib/student-excel";
import { addParticipantsAndAward, previewParticipantImport } from "@/lib/activity-participants";
import { AttendanceError } from "@/lib/attendance";

type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  if (error instanceof AttendanceError) return errorResponse(error.message, error.status);
  if (error instanceof StudentExcelError) return errorResponse(error.message, 400);
  return errorResponse("นำเข้าผู้เข้าร่วมไม่สำเร็จ กรุณาลองใหม่ด้วยข้อมูลเดิม", 500);
}
async function access(request: Request, context: Context) {
  const actor = await getCurrentUser();
  if (!actor) return { error: errorResponse("กรุณาเข้าสู่ระบบ", 401) };
  if (!canViewStudents(actor) || !hasPermission(actor, PERMISSIONS.ACTIVITY_MANAGE)) return { error: errorResponse("ไม่มีสิทธิ์นำเข้าผู้เข้าร่วม", 403) };
  if (!isSameOriginRequest(request)) return { error: errorResponse("กรุณานำเข้าจากหน้าเว็บไซต์ของระบบ", 403) };
  const { id } = await context.params;
  const activityId = parseId(id);
  if (!activityId || activityId > BigInt("9223372036854775807")) return { error: errorResponse("ไม่พบกิจกรรม", 404) };
  return { actorId: BigInt(actor.id), activityId };
}

export async function POST(request: Request, context: Context) {
  const permitted = await access(request, context);
  if (permitted.error) return permitted.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const yearId = form?.get("academicYearId");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || !file.size || file.size > MAX_STUDENT_IMPORT_BYTES) return errorResponse("กรุณาเลือกไฟล์ Excel .xlsx ที่ไม่ว่างและมีขนาดไม่เกิน 5 MB", 400);
  if (typeof yearId !== "string" || !/^[1-9]\d{0,18}$/.test(yearId)) return errorResponse("ปีการศึกษาไม่ถูกต้อง", 400);
  try {
    const rows = await previewParticipantImport(permitted.activityId, await readStudentExcel(await file.arrayBuffer()), yearId);
    const response = successResponse({ rows });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: Context) {
  const permitted = await access(request, context);
  if (permitted.error) return permitted.error;
  const parsed = participantImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.target.activityId !== String(permitted.activityId)) return errorResponse("ข้อมูลนำเข้าผู้เข้าร่วมไม่ถูกต้อง", 400);
  try {
    const result = await addParticipantsAndAward(permitted.activityId, permitted.actorId, { studentCodes: parsed.data.studentCodes, requestId: parsed.data.requestId, academicYearId: parsed.data.target.academicYearId });
    return successResponse(result, result.replayed ? 200 : 201);
  } catch (error) { return failure(error); }
}
