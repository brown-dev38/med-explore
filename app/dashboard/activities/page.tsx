import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext } from "@/lib/student-dashboard";
import { toActivityDto } from "@/lib/activities";
import type { ActivityListItem } from "@/types/activity";
import { ActivitiesBrowser } from "@/components/activities-browser";
import Link from "next/link";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
import { StudentYearSelector } from "@/components/student-year-selector";

export const metadata = {
  title: "เช็คอิน / เช็คเอาท์กิจกรรม | MedExplore Star",
};

export default function DashboardActivitiesPage(props: StudentYearPageProps) {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <DashboardActivitiesContent {...props} />
    </Suspense>
  );
}

async function DashboardActivitiesContent({ searchParams }: StudentYearPageProps) {
  const { user } = await getStudentDashboardContext();
  const { years, selectedYear } = await getStudentYearContext(searchParams);
  const selector = <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath="/dashboard/activities" />;
  if (!selectedYear || selectedYear.status !== "ACTIVE") {
    return <div className="space-y-5">{selector}<p role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{selectedYear?.status === "CLOSED" ? `ปีการศึกษา ${selectedYear.code} ปิดแล้ว ไม่สามารถเช็คอินหรือเช็คเอาท์ได้` : "ยังไม่มีปีการศึกษาที่เปิดใช้งานสำหรับบันทึกเวลา"}</p>{selectedYear && <Link href={`/dashboard/my-activities?academicYearId=${selectedYear.id}`} className="inline-block text-sm text-primary underline">ดูประวัติกิจกรรมของปีนี้</Link>}</div>;
  }

  const activities = await prisma.activity.findMany({
    where: { status: "PUBLISHED", academicYearId: BigInt(selectedYear.id) },
    orderBy: { startsAt: "asc" },
    include: { _count: { select: { participations: true } } },
  });

  const mine = await prisma.participation.findMany({
    where: {
      userId: BigInt(user.id),
      activityId: { in: activities.map((activity) => activity.id) },
    },
    select: {
      id: true,
      activityId: true,
      status: true,
      attendanceRecords: { select: { eventType: true, occurredAt: true } },
    },
  });

  const mineByActivity = new Map(
    mine.map((m) => {
      const checkIn = m.attendanceRecords.find(
        (record) => record.eventType === "CHECK_IN",
      );
      const checkOut = m.attendanceRecords.find(
        (record) => record.eventType === "CHECK_OUT",
      );
      return [
        String(m.activityId),
        {
          id: String(m.id),
          status: m.status,
          checkInAt: checkIn ? checkIn.occurredAt.toISOString() : null,
          checkOutAt: checkOut ? checkOut.occurredAt.toISOString() : null,
        },
      ] as const;
    }),
  );

  const initial: ActivityListItem[] = activities.map((activity) => ({
    ...toActivityDto(activity),
    participantCount: activity._count.participations,
    myParticipation: mineByActivity.get(String(activity.id)) ?? null,
  }));

  return <div className="space-y-5">{selector}<ActivitiesBrowser key={selectedYear.id} initial={initial} academicYearId={selectedYear.id} /></div>;
}
