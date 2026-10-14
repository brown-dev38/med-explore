import "server-only";
import type { AttendanceEvent, AttendanceMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AttendanceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttendanceError";
    this.status = status;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

export async function recordAttendance(params: {
  participationId: bigint;
  eventType: AttendanceEvent;
  method: AttendanceMethod;
  occurredAt: Date;
  recordedBy: bigint;
}) {
  try {
    return await prisma.attendanceRecord.create({
      data: {
        participationId: params.participationId,
        eventType: params.eventType,
        method: params.method,
        occurredAt: params.occurredAt,
        recordedBy: params.recordedBy,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const label = params.eventType === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์";
      throw new AttendanceError(
        `มีการลงเวลา${label}สำหรับผู้เข้าร่วมรายนี้ไปแล้ว`,
        409,
      );
    }
    throw error;
  }
}

export async function hasEvent(
  participationId: bigint,
  eventType: AttendanceEvent,
): Promise<boolean> {
  const count = await prisma.attendanceRecord.count({
    where: { participationId, eventType },
  });
  return count > 0;
}
