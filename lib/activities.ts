import "server-only";
import type { Activity } from "@prisma/client";
import type { ActivityDto } from "@/types/activity";

export function toActivityDto(activity: Activity): ActivityDto {
  return {
    id: String(activity.id),
    academicYearId: String(activity.academicYearId),
    organizerId: String(activity.organizerId),
    title: activity.title,
    description: activity.description,
    location: activity.location,
    startsAt: activity.startsAt.toISOString(),
    endsAt: activity.endsAt.toISOString(),
    minMinutes: activity.minMinutes,
    status: activity.status,
    createdAt: activity.createdAt.toISOString(),
  };
}
