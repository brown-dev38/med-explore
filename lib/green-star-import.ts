import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createCompletedHelpers } from "@/lib/helper-awards";
import type { GreenStarImportInput, GreenStarImportTarget, StudentImportRow } from "@/lib/green-star-import-schema";

export class GreenStarImportError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function checkTarget(db: Prisma.TransactionClient, target: GreenStarImportTarget) {
  const year = await db.academicYear.findUnique({ where: { id: BigInt(target.academicYearId) }, select: { status: true } });
  if (!year) throw new GreenStarImportError("ไม่พบปีการศึกษา", 404);
  if (year.status === "CLOSED") throw new GreenStarImportError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถนำเข้ารายชื่อได้", 409);
  if (target.mode === "activity") {
    const activity = await db.activity.findUnique({ where: { id: BigInt(target.activityId) }, select: { academicYearId: true } });
    if (!activity || String(activity.academicYearId) !== target.academicYearId) throw new GreenStarImportError("ไม่พบกิจกรรมในปีการศึกษาที่เลือก", 404);
  }
}

async function findStudents(db: Prisma.TransactionClient, studentCodes: string[]) {
  return db.user.findMany({
    where: { studentCode: { in: studentCodes }, isActive: true, userRoles: { some: { role: { name: "STUDENT" } } } },
    select: { id: true, studentCode: true, firstname: true, lastname: true, username: true },
  });
}

export async function previewGreenStarImport(target: GreenStarImportTarget, rows: StudentImportRow[]) {
  await checkTarget(prisma, target);
  const students = await findStudents(prisma, rows.filter((row) => row.status === "ready").map((row) => row.studentCode));
  const byCode = new Map(students.map((student) => [student.studentCode, student]));
  const assigned = target.mode === "activity" ? await prisma.helperAssignment.findMany({
    where: { activityId: BigInt(target.activityId), userId: { in: students.map((student) => student.id) } }, select: { userId: true },
  }) : [];
  const assignedIds = new Set(assigned.map((helper) => String(helper.userId)));
  return rows.map((row): StudentImportRow => {
    if (row.status !== "ready") return row;
    const student = byCode.get(row.studentCode);
    if (!student) return { ...row, status: "not-found", message: "ไม่พบนิสิตที่เปิดใช้งานและมีรหัสนี้ในระบบ" };
    const name = [student.firstname, student.lastname].filter(Boolean).join(" ") || student.username;
    if (assignedIds.has(String(student.id))) return { ...row, name, status: "assigned", message: "มีรายชื่อช่วยงานในกิจกรรมนี้แล้ว จะไม่นำเข้าซ้ำ" };
    return { ...row, name, message: "พร้อมนำเข้า" };
  });
}

export async function confirmGreenStarImport(input: GreenStarImportInput, actorId: bigint) {
  const target = input.target;
  const studentCodes = [...input.studentCodes].sort();
  const action = input.target.mode === "work" ? "star.import_green_work" : "helper.import_excel";
  const receiptData = { target: input.target, studentCodes, description: input.description };
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // The receipt and all imported rows commit together, including retries.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`;
        const actor = await tx.user.findFirst({ where: {
          id: actorId, isActive: true, userRoles: { some: { role: input.target.mode === "work"
            ? { name: { in: ["ADMIN", "ORGANIZER"] } }
            : { OR: [{ name: "ADMIN" }, { permissions: { some: { permission: { code: "activity.manage" } } } }] },
          } },
        }, select: { id: true } });
        if (!actor) throw new GreenStarImportError("ไม่มีสิทธิ์นำเข้ารายชื่อ", 403);
        const receipt = await tx.auditLog.findFirst({ where: {
          actorId, action, details: { path: "$.requestId", equals: input.requestId },
        }, select: { details: true } });
        if (receipt) {
          const details = receipt.details as { payload?: string; imported?: number } | null;
          if (details?.payload !== JSON.stringify(receiptData) || typeof details.imported !== "number") {
            throw new GreenStarImportError("คำขอนี้ถูกบันทึกด้วยข้อมูลอื่นแล้ว กรุณาตรวจสอบประวัติ", 409);
          }
          return { imported: details.imported, replayed: true };
        }
        await checkTarget(tx, input.target);
        const students = await findStudents(tx, studentCodes);
        const byCode = new Map(students.map((student) => [student.studentCode, student]));
        if (studentCodes.some((code) => !byCode.has(code))) throw new GreenStarImportError("รายชื่อนิสิตเปลี่ยนแปลง กรุณาตรวจสอบไฟล์อีกครั้ง ยังไม่มีการนำเข้ารายการใด", 409);
        const studentIds = studentCodes.map((code) => byCode.get(code)!.id);
        const now = new Date();
        const activity = target.mode === "activity"
          ? await tx.activity.findUniqueOrThrow({ where: { id: BigInt(target.activityId) } }) : null;
        const result = target.mode === "work"
          ? await tx.starTransaction.createMany({ data: studentIds.map((userId) => ({
            userId, academicYearId: BigInt(target.academicYearId), starType: "GREEN", points: 1,
            status: "APPROVED", approvedBy: actorId, approvedAt: now, reason: input.description,
          })) })
          : await createCompletedHelpers(tx, activity!, studentIds, actorId, input.description);
        await tx.auditLog.create({ data: {
          actorId, action, entityType: input.target.mode === "work" ? "AcademicYear" : "Activity",
          entityId: BigInt(input.target.mode === "work" ? input.target.academicYearId : input.target.activityId),
          details: { requestId: input.requestId, payload: JSON.stringify(receiptData), imported: result.count },
        } });
        return { imported: result.count, replayed: false };
      }, { isolationLevel: "Serializable", timeout: 30000 });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
}
