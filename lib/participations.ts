import "server-only";
import type { AttendanceRecord, Prisma } from "@prisma/client";
import type {
  AttendanceRecordDto,
  ParticipationDto,
} from "@/types/activity";

export type ParticipationWithRelations = Prisma.ParticipationGetPayload<{
  include: { user: true; attendanceRecords: true; starTransactions: true };
}>;

export function toAttendanceDto(
  record: AttendanceRecord,
): AttendanceRecordDto {
  return {
    id: String(record.id),
    eventType: record.eventType,
    method: record.method,
    occurredAt: record.occurredAt.toISOString(),
  };
}

export function toParticipationDto(
  participation: ParticipationWithRelations,
): ParticipationDto {
  const name =
    [participation.user.firstname, participation.user.lastname]
      .filter(Boolean)
      .join(" ") || participation.user.username;

  return {
    id: String(participation.id),
    activityId: String(participation.activityId),
    userId: String(participation.userId),
    userName: name,
    studentCode: participation.user.studentCode,
    email: participation.user.email,
    status: participation.status,
    eligibilityStatus: participation.eligibilityStatus,
    attendedMinutes: participation.attendedMinutes,
    yellowStarPoints: participation.starTransactions.filter((star) => star.starType === "YELLOW" && star.status === "APPROVED").reduce((sum, star) => sum + star.points, 0),
    reviewNote: participation.reviewNote,
    createdAt: participation.createdAt.toISOString(),
    attendance: participation.attendanceRecords.map(toAttendanceDto),
  };
}
