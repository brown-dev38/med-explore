import "server-only";
import type { AttendanceEvent, AttendanceMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateAttendance, lockAttendanceUser } from "@/lib/attendance-results";

export class AttendanceError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AttendanceError";
  }
}

async function requireOpenActivityYear(tx: Prisma.TransactionClient, activityId: bigint) {
  const [year] = await tx.$queryRaw<{ status: string }[]>`
    SELECT y.status FROM academic_years y
    INNER JOIN activities a ON a.academic_year_id = y.id
    WHERE a.id = ${activityId} LOCK IN SHARE MODE
  `;
  if (!year) throw new AttendanceError("ไม่พบกิจกรรม", 404);
  if (year.status === "CLOSED") throw new AttendanceError("ปีการศึกษานี้ปิดแล้ว ไม่สามารถแก้ไขเวลาและดาวได้", 409);
}

export async function attendanceTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable", timeout: 60000 });
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string | number; driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } } };
      const cause = failure.meta?.driverAdapterError?.cause;
      const conflict = failure.code === "P2034" || (failure.code === "P2010" && (
        cause?.kind === "TransactionWriteConflict" || ["1213", "1205"].includes(String(failure.meta?.code ?? cause?.originalCode))
      ));
      if (conflict && attempt < 2) continue;
      throw error;
    }
  }
}

type AttendanceWrite = { eventType: AttendanceEvent; occurredAt: Date };

async function writeEvents(tx: Prisma.TransactionClient, params: {
  participationId: bigint; events: AttendanceWrite[]; method: AttendanceMethod;
  recordedBy: bigint; replaceExisting: boolean; skipMissingCheckIn?: boolean;
}) {
  const { participationId, method, recordedBy } = params;
  if (!(await lockAttendanceUser(tx, participationId))) throw new AttendanceError("ไม่พบผู้เข้าร่วม", 404);
  const participation = await tx.participation.findUniqueOrThrow({ where: { id: participationId }, select: { activityId: true } });
  await requireOpenActivityYear(tx, participation.activityId);
  const current = await tx.attendanceRecord.findMany({ where: { participationId } });
  let events = params.events;
  const existingIn = current.find((record) => record.eventType === "CHECK_IN");
  let skippedCheckOut = false;
  if (events.some((event) => event.eventType === "CHECK_OUT") && !existingIn && !events.some((event) => event.eventType === "CHECK_IN")) {
    if (!params.skipMissingCheckIn) throw new AttendanceError("ยังไม่พบการเช็คอิน ไม่สามารถบันทึกเช็คเอาท์ได้", 400);
    events = events.filter((event) => event.eventType !== "CHECK_OUT");
    skippedCheckOut = true;
  }
  if (events.length === 0) return { record: null, created: false, evaluation: null, skippedCheckOut };
  if (!params.replaceExisting) {
    const duplicate = events.find((event) => current.some((record) => record.eventType === event.eventType));
    if (duplicate) throw new AttendanceError(`มีการลงเวลา${duplicate.eventType === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"}สำหรับผู้เข้าร่วมรายนี้ไปแล้ว`, 409);
  }
  const prospectiveIn = events.find((event) => event.eventType === "CHECK_IN")?.occurredAt ?? existingIn?.occurredAt;
  const prospectiveOut = events.find((event) => event.eventType === "CHECK_OUT")?.occurredAt ?? current.find((record) => record.eventType === "CHECK_OUT")?.occurredAt;
  if (prospectiveIn && prospectiveOut && prospectiveOut < prospectiveIn) {
    throw new AttendanceError("เวลาเช็คเอาท์ต้องไม่อยู่ก่อนเวลาเช็คอิน", 400);
  }
  const records = [];
  let created = false;
  for (const event of events) {
    const existing = current.find((record) => record.eventType === event.eventType);
    const record = existing
      ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: { occurredAt: event.occurredAt, recordedBy } })
      : await tx.attendanceRecord.create({ data: { participationId, eventType: event.eventType, occurredAt: event.occurredAt, method, recordedBy } });
    records.push(record);
    created = !existing;
    await tx.auditLog.create({ data: {
      actorId: recordedBy, action: existing ? "attendance.update" : "attendance.record",
      entityType: "AttendanceRecord", entityId: record.id,
      details: { activityId: String(participation.activityId), eventType: event.eventType, method, occurredAt: event.occurredAt.toISOString() },
    } });
  }
  const evaluation = await evaluateAttendance(tx, participationId, recordedBy);
  return { record: records.at(-1)!, created, evaluation, skippedCheckOut };
}

export async function recordAttendance(params: {
  participationId: bigint; eventType: AttendanceEvent; method: AttendanceMethod;
  occurredAt: Date; recordedBy: bigint; replaceExisting?: boolean;
}) {
  const result = await attendanceTransaction((tx) => writeEvents(tx, {
    ...params, events: [{ eventType: params.eventType, occurredAt: params.occurredAt }], replaceExisting: params.replaceExisting ?? false,
  }));
  return { ...result, record: result.record!, evaluation: result.evaluation! };
}

export async function bulkRecordAttendance(activityId: bigint, actorId: bigint, checkInAt: Date | null, checkOutAt: Date | null) {
  return attendanceTransaction(async (tx) => {
    const participations = await tx.participation.findMany({ where: { activityId }, select: { id: true }, orderBy: { userId: "asc" } });
    let updated = 0;
    let skippedCheckOut = 0;
    const events: AttendanceWrite[] = [
      ...(checkInAt ? [{ eventType: "CHECK_IN" as const, occurredAt: checkInAt }] : []),
      ...(checkOutAt ? [{ eventType: "CHECK_OUT" as const, occurredAt: checkOutAt }] : []),
    ];
    for (const participation of participations) {
      const result = await writeEvents(tx, { participationId: participation.id, events, method: "ORGANIZER", recordedBy: actorId, replaceExisting: true, skipMissingCheckIn: true });
      if (result.record) updated++;
      if (result.skippedCheckOut) skippedCheckOut++;
    }
    await tx.auditLog.create({ data: {
      actorId, action: "attendance.bulk", entityType: "Activity", entityId: activityId,
      details: { checkInAt: checkInAt?.toISOString() ?? null, checkOutAt: checkOutAt?.toISOString() ?? null, participants: participations.length, updated, skippedCheckOut },
    } });
    return { participants: participations.length, updated, skippedCheckOut };
  });
}

export async function recalculateActivityAttendance(tx: Prisma.TransactionClient, activityId: bigint, actorId: bigint) {
  await requireOpenActivityYear(tx, activityId);
  const participations = await tx.participation.findMany({ where: { activityId }, select: { id: true }, orderBy: { userId: "asc" } });
  for (const participation of participations) {
    if (await lockAttendanceUser(tx, participation.id)) await evaluateAttendance(tx, participation.id, actorId);
  }
  await tx.auditLog.create({ data: {
    actorId, action: "attendance.recalculate", entityType: "Activity", entityId: activityId,
    details: { participants: participations.length },
  } });
  return { participants: participations.length };
}

export async function backfillAttendanceResults(participationIds?: readonly bigint[]) {
  return attendanceTransaction(async (tx) => {
    const pending = await tx.participation.findMany({
      where: {
        ...(participationIds ? { id: { in: [...participationIds] } } : {}),
        attendedMinutes: null,
        activity: { academicYear: { status: { not: "CLOSED" } } },
        AND: [
          { attendanceRecords: { some: { eventType: "CHECK_IN" } } },
          { attendanceRecords: { some: { eventType: "CHECK_OUT" } } },
        ],
      },
      select: { id: true, activityId: true }, orderBy: [{ userId: "asc" }, { id: "asc" }],
    });
    const processed: string[] = [];
    let approvedYellowStars = 0;
    for (const participation of pending) {
      await requireOpenActivityYear(tx, participation.activityId);
      if (!(await lockAttendanceUser(tx, participation.id))) continue;
      const current = await tx.participation.findUnique({ where: { id: participation.id }, select: { attendedMinutes: true } });
      if (!current || current.attendedMinutes !== null) continue;
      const result = await evaluateAttendance(tx, participation.id, null);
      approvedYellowStars += result.yellowStarPoints;
      processed.push(String(participation.id));
    }
    if (processed.length > 0) {
      await tx.auditLog.create({ data: {
        actorId: null, action: "attendance.backfill", entityType: "Participation",
        details: { participationIds: processed, processed: processed.length, approvedYellowStars },
      } });
    }
    return { processed: processed.length, approvedYellowStars };
  });
}
