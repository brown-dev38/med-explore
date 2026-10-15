import { getCurrentUser } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { errorResponse, parseId, successResponse } from "@/lib/api";
import {
  updateHelperStatusAndStar,
  removeHelper,
} from "@/lib/helpers";
import { helperUpdateSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string; helperId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์จัดการผู้ช่วยงาน", 403);
  }

  const { helperId } = await params;
  const parsedHelperId = parseId(helperId);
  if (!parsedHelperId) return errorResponse("ไม่พบข้อมูลผู้ช่วยงาน", 404);

  const json = await req.json().catch(() => null);
  const parsed = helperUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  }

  try {
    const updated = await updateHelperStatusAndStar(
      parsedHelperId,
      parsed.data.status,
      BigInt(user.id),
      parsed.data.description,
    );
    return successResponse(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return errorResponse("ไม่พบข้อมูลผู้ช่วยงาน", 404);
    }
    return errorResponse("ไม่สามารถอัปเดตสถานะผู้ช่วยงานได้", 500);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
    return errorResponse("ไม่มีสิทธิ์ลบผู้ช่วยงาน", 403);
  }

  const { helperId } = await params;
  const parsedHelperId = parseId(helperId);
  if (!parsedHelperId) return errorResponse("ไม่พบข้อมูลผู้ช่วยงาน", 404);

  try {
    await removeHelper(parsedHelperId, BigInt(user.id));
    return successResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return errorResponse("ไม่พบข้อมูลผู้ช่วยงาน", 404);
    }
    return errorResponse("ไม่สามารถลบผู้ช่วยงานได้", 500);
  }
}

