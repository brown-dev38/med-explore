import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { passwordChangeSchema } from "@/lib/password-validation";
import { errorResponse, successResponse } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/request-origin";

export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!isSameOriginRequest(request)) return errorResponse("คำขอไม่ถูกต้อง กรุณาลองใหม่จากหน้าเว็บไซต์", 403);
  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  let step = "lookup";
  try {
    const userId = BigInt(actor.id);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, passwordHash: true } });
      if (!user?.isActive) return { error: "บัญชีไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่", status: 401 } as const;
      if (!user.passwordHash) return { error: "บัญชีนี้ยังไม่มีรหัสผ่านของระบบ กรุณาติดต่อผู้ดูแลระบบ", status: 400 } as const;
      step = "verify";
      if (!await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)) {
        return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง", status: 403 } as const;
      }
      if (await bcrypt.compare(parsed.data.password, user.passwordHash)) {
        return { error: "รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน", status: 400 } as const;
      }
      step = "hash";
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      step = "update";
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      step = "invalidate-links";
      await tx.microsoftLinkIntent.deleteMany({ where: { userId } });
      step = "audit";
      await tx.auditLog.create({ data: { actorId: userId, action: "user.password.change", entityType: "User", entityId: userId } });
      return { changed: true };
    }, { isolationLevel: "Serializable" });
    if (result.error) return errorResponse(result.error, result.status);
    const response = successResponse({ changed: true });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2034") return errorResponse("รหัสผ่านหรือข้อมูลบัญชีถูกแก้ไขพร้อมกัน กรุณาลองใหม่", 409);
    if (code === "P2025") return errorResponse("ไม่พบบัญชีผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่", 401);
    console.error("Password change failed", { step, code: code ?? "UNKNOWN", name: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
