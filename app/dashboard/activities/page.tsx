import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { toActivityDto } from "@/lib/activities";
import type { ActivityListItem } from "@/types/activity";
import { ActivitiesBrowser } from "@/components/activities-browser";

export const metadata = {
  title: "กิจกรรมทั้งหมด | MedExplore Star",
};

export default function DashboardActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <DashboardActivitiesContent />
    </Suspense>
  );
}

async function DashboardActivitiesContent() {
  const user = await requireAuth();

  const activities = await prisma.activity.findMany({
    where: { status: "PUBLISHED" },
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

  return <ActivitiesBrowser initial={initial} />;
}
