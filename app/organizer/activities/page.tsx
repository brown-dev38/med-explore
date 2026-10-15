import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { toActivityDto } from "@/lib/activities";
import type { ActivityListItem } from "@/types/activity";
import { ActivitiesManager } from "@/components/activities-manager";

export const metadata = {
  title: "กิจกรรมที่จัด | MedExplore Star",
};

export default function OrganizerActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <OrganizerActivitiesContent />
    </Suspense>
  );
}

async function OrganizerActivitiesContent() {
  const user = await requirePermission(PERMISSIONS.ACTIVITY_MANAGE);

  const activities = await prisma.activity.findMany({
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { participations: true } } },
  });

  const initial: ActivityListItem[] = activities.map((activity) => ({
    ...toActivityDto(activity),
    participantCount: activity._count.participations,
    myParticipation: null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          กิจกรรมที่จัด
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          สร้างกิจกรรม กำหนดช่วงเวลา เปิดรับลงทะเบียน และบันทึกการเข้างาน
        </p>
      </div>
      <ActivitiesManager
        initial={initial}
        detailBasePath="/organizer/activities"
        canDeleteAll={hasRole(user, ROLES.ADMIN)}
      />
    </div>
  );
}
