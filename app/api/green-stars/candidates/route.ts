import { getCurrentUser } from "@/lib/dal";
import { canManageGreenStars } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canManageGreenStars(actor)) return errorResponse("ไม่มีสิทธิ์ค้นหานิสิต", 403);
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const students = await prisma.user.findMany({
    where: { isActive: true, userRoles: { some: { role: { name: "STUDENT" } } },
      ...(query ? { OR: ["firstname", "lastname", "username", "email", "studentCode"].map((field) => ({ [field]: { contains: query } })) } : {}),
    }, select: { id: true, firstname: true, lastname: true, username: true, studentCode: true },
    orderBy: [{ studentCode: "asc" }, { id: "asc" }], take: 100,
  });
  return successResponse(students.map((student) => ({ id: String(student.id), name: [student.firstname, student.lastname].filter(Boolean).join(" ") || student.username, studentCode: student.studentCode })));
}
