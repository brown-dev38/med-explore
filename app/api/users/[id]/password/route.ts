import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hasRole, ROLES } from "@/lib/permissions";
import { adminPasswordResetSchema } from "@/lib/password-validation";
import { errorResponse, successResponse } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/request-origin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!hasRole(actor, ROLES.ADMIN)) return errorResponse("เฉพาะ ADMIN เท่านั้นที่เปลี่ยนรหัสผ่านผู้ใช้งานได้", 403);
  if (!isSameOriginRequest(request)) return errorResponse("คำขอไม่ถูกต้อง กรุณาลองใหม่จากหน้าเว็บไซต์", 403);

  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) return errorResponse("ไม่พบผู้ใช้งาน", 404);
  const parsed = adminPasswordResetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);

  let step = "lookup";
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Recheck database roles so a stale ADMIN session cannot reset passwords.
      const currentActor = await tx.user.findFirst({ where: {
        id: BigInt(actor.id), isActive: true, userRoles: { some: { role: { name: ROLES.ADMIN } } },
      }, select: { id: true } });
      if (!currentActor) return { error: "เฉพาะ ADMIN ที่เปิดใช้งานเท่านั้นที่เปลี่ยนรหัสผ่านได้", status: 403 } as const;
      const target = await tx.user.findUnique({ where: { id: BigInt(id) }, select: {
        id: true, userRoles: { select: { role: { select: { name: true } } } },
      } });
      if (!target) return { error: "ไม่พบผู้ใช้งาน", status: 404 } as const;
      const role = target.userRoles[0]?.role.name;
      if (target.userRoles.length !== 1 || (role !== ROLES.STUDENT && role !== ROLES.ORGANIZER)) {
        return { error: "เปลี่ยนรหัสผ่านได้เฉพาะ STUDENT และ ORGANIZER", status: 403 } as const;
      }
      step = "hash";
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      step = "update";
      await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
      step = "invalidate-links";
      await tx.microsoftLinkIntent.deleteMany({ where: { userId: target.id } });
      step = "audit";
      await tx.auditLog.create({ data: {
        actorId: currentActor.id, action: "user.password.reset", entityType: "User", entityId: target.id,
        details: { role },
      } });
      return { id: String(target.id) };
    }, { isolationLevel: "Serializable" });
    if (result.error) return errorResponse(result.error, result.status);
    const response = successResponse({ id: result.id });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2034") return errorResponse("มีการแก้ไขข้อมูลพร้อมกัน กรุณาลองใหม่", 409);
    if (code === "P2025") return errorResponse("ไม่พบผู้ใช้งาน", 404);
    console.error("Admin password reset failed", { step, code: code ?? "UNKNOWN", name: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse("เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
