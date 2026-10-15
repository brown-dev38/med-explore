import type { Prisma } from "@prisma/client";
import type { AcademicYearStatus } from "@/types/academic-year";
import type { ActivityStatus, AttendanceEvent } from "@/types/activity";

export type StudentYearOption = {
  id: string;
  code: string;
  status: AcademicYearStatus;
};

export type StudentActivityFilter = "all" | "missed" | "attended" | "cancelled";
export type StudentSearchParams = Record<string, string | string[] | undefined>;
export type StudentYearPageProps = { searchParams: Promise<StudentSearchParams> };

export function isIncompleteCompletedParticipation(participation: {
  activity: { status: ActivityStatus };
  attendanceRecords: { eventType: AttendanceEvent }[];
}): boolean {
  return participation.activity.status === "COMPLETED" &&
    participation.attendanceRecords.some((record) => record.eventType === "CHECK_IN") &&
    !participation.attendanceRecords.some((record) => record.eventType === "CHECK_OUT");
}

export function selectStudentYear(years: StudentYearOption[], requestedId?: string) {
  if (requestedId) return years.find((year) => year.id === requestedId) ?? null;
  return years.find((year) => year.status === "ACTIVE") ?? years[0] ?? null;
}

export function studentActivitiesHref(yearId: string, filter: StudentActivityFilter = "all") {
  const params = new URLSearchParams({ academicYearId: yearId });
  if (filter !== "all") params.set("filter", filter);
  return `/dashboard/year-activities?${params}`;
}

export function studentActivityWhere(
  yearId: string,
  userId: string,
  now: Date,
  filter: StudentActivityFilter = "all",
): Prisma.ActivityWhereInput {
  const year = { academicYearId: BigInt(yearId) };
  if (filter === "cancelled") return { ...year, status: "CANCELLED" };
  if (filter === "missed") {
    return {
      ...year,
      OR: [
        { status: "COMPLETED" },
        { status: "PUBLISHED", endsAt: { lte: now } },
      ],
      participations: {
        none: {
          userId: BigInt(userId),
          attendanceRecords: { some: { eventType: "CHECK_IN" } },
        },
      },
    };
  }
  if (filter === "attended") {
    return {
      ...year,
      participations: {
        some: {
          userId: BigInt(userId),
          AND: [
            { attendanceRecords: { some: { eventType: "CHECK_IN" } } },
            { attendanceRecords: { some: { eventType: "CHECK_OUT" } } },
          ],
        },
      },
    };
  }
  return year;
}
