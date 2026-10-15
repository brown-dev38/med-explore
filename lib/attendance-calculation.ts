export const YELLOW_STAR_YEAR_LIMIT = 12;

export function calculateAttendedMinutes(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const difference = checkOut.getTime() - checkIn.getTime();
  if (!Number.isFinite(difference) || difference < 0) throw new RangeError("เวลาเช็คเอาท์ต้องไม่อยู่ก่อนเวลาเช็คอิน");
  return Math.floor(difference / 60000);
}

type AttendanceTimeRecord = { eventType: string; occurredAt: Date | string };

export function attendanceMinutesFromRecords(records: readonly AttendanceTimeRecord[]): number | null {
  const checkIn = records.find((record) => record.eventType === "CHECK_IN");
  const checkOut = records.find((record) => record.eventType === "CHECK_OUT");
  if (!checkIn || !checkOut) return null;
  const start = typeof checkIn.occurredAt === "string" ? new Date(checkIn.occurredAt) : checkIn.occurredAt;
  const end = typeof checkOut.occurredAt === "string" ? new Date(checkOut.occurredAt) : checkOut.occurredAt;
  try { return calculateAttendedMinutes(start, end); }
  catch { return null; }
}

export function totalAttendanceMinutes(participations: readonly {
  activity: { status: string };
  attendanceRecords: readonly AttendanceTimeRecord[];
}[]): number {
  return participations.reduce((total, participation) => participation.activity.status === "CANCELLED"
    ? total : total + (attendanceMinutesFromRecords(participation.attendanceRecords) ?? 0), 0);
}
