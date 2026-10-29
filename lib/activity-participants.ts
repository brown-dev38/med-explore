import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AttendanceError, attendanceTransaction } from "@/lib/attendance";
import { evaluateAttendance } from "@/lib/attendance-results";
import type { StudentImportRow } from "@/lib/green-star-import-schema";

export const participantStudentWhere = {
  isActive: true,
  userRoles: {
    some: { role: { name: "STUDENT" } },
    none: { role: { name: { in: ["ADMIN", "ORGANIZER"] } } },
  },
} satisfies Prisma.UserWhereInput;

async function requireActivity(tx: Prisma.TransactionClient, activityId: bigint, yearId?: string, allowAnyStatus = false) {
  const activity = await tx.activity.findUnique({ where: { id: activityId } });
  if (!activity || (yearId && String(activity.academicYearId) !== yearId)) throw new AttendanceError("ไม่พบกิจกรรมในปีการศึกษาที่เลือก", 404);
  const [year] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM academic_years WHERE id = ${activity.academicYearId} LOCK IN SHARE MODE`;
  if (!year || year.status === "CLOSED") throw new AttendanceError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถเพิ่มผู้เข้าร่วมและดาวได้", 409);
  if (!allowAnyStatus && activity.status !== "PUBLISHED" && activity.status !== "COMPLETED") throw new AttendanceError("เพิ่มผู้เข้าร่วมพร้อมให้ดาวได้เฉพาะกิจกรรมที่เปิดรับลงทะเบียนหรือสิ้นสุดแล้ว", 409);
  return activity;
}

async function requireActor(tx: Prisma.TransactionClient, actorId: bigint) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`;
  const actor = await tx.user.findFirst({ where: {
    id: actorId, isActive: true,
    userRoles: { some: { role: { name: { in: ["ADMIN", "ORGANIZER"] } } } },
    OR: [
      { userRoles: { some: { role: { name: "ADMIN" } } } },
      { userRoles: { some: { role: { permissions: { some: { permission: { code: "activity.manage" } } } } } } },
    ],
  }, select: { id: true } });
  if (!actor) throw new AttendanceError("ไม่มีสิทธิ์เพิ่มผู้เข้าร่วมและให้ดาว", 403);
}

export async function previewParticipantImport(activityId: bigint, rows: StudentImportRow[], yearId?: string) {
  return prisma.$transaction(async (tx) => {
    await requireActivity(tx, activityId, yearId);
    const students = await tx.user.findMany({
      where: { ...participantStudentWhere, studentCode: { in: rows.filter((row) => row.status === "ready").map((row) => row.studentCode) } },
      select: { id: true, studentCode: true, firstname: true, lastname: true, username: true },
    });
    const byCode = new Map(students.map((student) => [student.studentCode, student]));
    const existing = await tx.participation.findMany({ where: { activityId, userId: { in: students.map((student) => student.id) } }, select: { userId: true } });
    const registered = new Set(existing.map((row) => String(row.userId)));
    return rows.map((row): StudentImportRow => {
      if (row.status !== "ready") return row;
      const student = byCode.get(row.studentCode);
      if (!student) return { ...row, status: "not-found", message: "ไม่พบนิสิตที่เปิดใช้งาน หรือเป็นบัญชี admin/ผู้จัด" };
      const name = [student.firstname, student.lastname].filter(Boolean).join(" ") || student.username;
      return registered.has(String(student.id))
        ? { ...row, name, status: "assigned", message: "ลงทะเบียนกิจกรรมนี้แล้ว จะไม่นำเข้าซ้ำ" }
        : { ...row, name, message: "พร้อมเพิ่มผู้เข้าร่วมและประเมินดาวสีเหลืองทันที" };
    });
  });
}

export async function addParticipantsAndAward(activityId: bigint, actorId: bigint, input: {
  userIds?: string[]; studentCodes?: string[]; requestId?: string; academicYearId?: string;
}) {
  const action = input.studentCodes ? "participation.import_excel" : "participation.add";
  const payload = JSON.stringify({ activityId: String(activityId), academicYearId: input.academicYearId ?? null,
    userIds: input.userIds ? [...new Set(input.userIds)].sort() : null, studentCodes: input.studentCodes ? [...new Set(input.studentCodes)].sort() : null });
  return attendanceTransaction(async (tx) => {
    await requireActor(tx, actorId);
    if (input.requestId) {
      const receipt = await tx.auditLog.findFirst({ where: { actorId, action, details: { path: "$.requestId", equals: input.requestId } }, select: { details: true } });
      if (receipt) {
        const details = receipt.details as { payload?: string; added?: number; awarded?: number } | null;
        if (details?.payload !== payload || typeof details.added !== "number" || typeof details.awarded !== "number") throw new AttendanceError("คำขอนี้ถูกบันทึกด้วยข้อมูลอื่นแล้ว กรุณาตรวจสอบรายชื่อ", 409);
        return { added: details.added, awarded: details.awarded, imported: details.added, replayed: true };
      }
    }
    await requireActivity(tx, activityId, input.academicYearId);
    const requested = input.studentCodes ? [...new Set(input.studentCodes)] : [...new Set(input.userIds ?? [])];
    if (!requested.length || requested.length > 500) throw new AttendanceError("เลือกนิสิตได้ 1–500 คนต่อครั้ง", 400);
    const students = await tx.user.findMany({ where: { ...participantStudentWhere,
      ...(input.studentCodes ? { studentCode: { in: requested } } : { id: { in: requested.map((id) => BigInt(id)) } }),
    }, select: { id: true }, orderBy: { id: "asc" } });
    if (students.length !== requested.length) throw new AttendanceError("เลือกได้เฉพาะนิสิตที่เปิดใช้งานและไม่มีบทบาท admin/ผู้จัด กรุณาตรวจสอบรายชื่ออีกครั้ง", 409);
    for (const student of students) await tx.$queryRaw`SELECT id FROM users WHERE id = ${student.id} FOR UPDATE`;
    const existing = await tx.participation.findMany({ where: { activityId, userId: { in: students.map((student) => student.id) } }, select: { userId: true } });
    const registered = new Set(existing.map((row) => String(row.userId)));
    const newStudents = students.filter((student) => !registered.has(String(student.id)));
    const now = new Date();
    let awarded = 0;
    if (newStudents.length) {
      await tx.participation.createMany({ data: newStudents.map((student) => ({ activityId, userId: student.id, reviewDueAt: now })) });
      const created = await tx.participation.findMany({ where: { activityId, userId: { in: newStudents.map((student) => student.id) } }, select: { id: true }, orderBy: { userId: "asc" } });
      await tx.attendanceRecord.createMany({ data: created.map((row) => ({ participationId: row.id, eventType: "CHECK_IN", method: "ORGANIZER", occurredAt: now, recordedBy: actorId })) });
      for (const row of created) awarded += (await evaluateAttendance(tx, row.id, actorId, now)).yellowStarPoints;
    }
    await tx.auditLog.create({ data: { actorId, action, entityType: "Activity", entityId: activityId,
      details: { requestId: input.requestId ?? null, payload, requested: requested.length, added: newStudents.length, awarded, method: "ORGANIZER", checkedInAt: now.toISOString() },
    } });
    return { added: newStudents.length, awarded, imported: newStudents.length, replayed: false };
  });
}

export async function cancelParticipantYellowStar(activityId: bigint, participationId: bigint, actorId: bigint) {
  return attendanceTransaction(async (tx) => {
    await requireActor(tx, actorId);
    await requireActivity(tx, activityId, undefined, true);
    const participation = await tx.participation.findFirst({
      where: { id: participationId, activityId }, select: { id: true, userId: true, eligibilityStatus: true, reviewedBy: true },
    });
    if (!participation) throw new AttendanceError("ไม่พบผู้เข้าร่วมในกิจกรรมนี้", 404);
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${participation.userId} FOR UPDATE`;
    if (participation.eligibilityStatus === "REJECTED" && participation.reviewedBy != null) return { cancelled: true };
    const message = "ผู้จัดยกเลิกการให้ดาวสีเหลือง";
    const result = await tx.starTransaction.updateMany({
      where: { participationId, starType: "YELLOW", status: { in: ["APPROVED", "PENDING"] } },
      data: { status: "REJECTED", approvedBy: null, approvedAt: null, reason: message },
    });
    await tx.participation.update({ where: { id: participationId }, data: {
      eligibilityStatus: "REJECTED", reviewedBy: actorId, reviewedAt: new Date(), reviewDueAt: null, reviewNote: message,
    } });
    await tx.auditLog.create({ data: {
      actorId, action: "star.cancel_yellow", entityType: "Participation", entityId: participationId,
      details: { activityId: String(activityId), studentId: String(participation.userId), revokedTransactions: result.count },
    } });
    return { cancelled: true };
  });
}
