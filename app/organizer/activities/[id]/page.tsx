import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { PERMISSIONS } from "@/lib/permissions";
import { parseId } from "@/lib/api";
import { toActivityDto } from "@/lib/activities";
import { toParticipationDto } from "@/lib/participations";
import { ActivityDetail } from "@/components/activity-detail";

export const metadata = {
  title: "รายละเอียดกิจกรรม | MedExplore Star",
};

export default function OrganizerActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <ActivityDetailContent params={params} />
    </Suspense>
  );
}

async function ActivityDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.ACTIVITY_MANAGE);

  const { id } = await params;
  const activityId = parseId(id);
  if (!activityId) notFound();

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) notFound();

  const participations = await prisma.participation.findMany({
    where: { activityId },
    include: { user: true, attendanceRecords: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <ActivityDetail
      activity={toActivityDto(activity)}
      participants={participations.map(toParticipationDto)}
    />
  );
}
