import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { hasRole, PERMISSIONS, ROLES } from "@/lib/permissions";
import { toActivityDto } from "@/lib/activities";
import type { ActivityListItem } from "@/types/activity";
import { ActivitiesManager } from "@/components/activities-manager";

export const metadata = {
  title: "กิจกรรม | MedExplore Star",
};

export default function AdminActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <AdminActivitiesContent />
    </Suspense>
  );
}

async function AdminActivitiesContent() {
  const user = await requirePermission(PERMISSIONS.ACTIVITY_MANAGE);
  const academicYears = await prisma.academicYear.findMany({
    orderBy: { startsOn: "desc" },
    select: { id: true, code: true, status: true },
  });
  const activeAcademicYear = academicYears.find((year) => year.status === "ACTIVE");

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
      {/* <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          จัดการกิจกรรม
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          สร้างกิจกรรม เปิดรับลงทะเบียน และบันทึกการเข้างาน
        </p>
      </div> */}
      <ActivitiesManager initial={initial} academicYears={academicYears.map((year) => ({ ...year, id: String(year.id) }))} activeAcademicYearCode={activeAcademicYear?.code ?? null} detailBasePath="/admin/activities" canDeleteAll={hasRole(user, ROLES.ADMIN)} />
    </div>
  );
}
