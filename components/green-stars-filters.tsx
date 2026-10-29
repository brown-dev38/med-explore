"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import type { StudentYearOption } from "@/lib/student-activity-filters";
import type { ActivityStatus } from "@/types/activity";
import { Label } from "@/components/ui/label";

const YEAR_STATUS = { ACTIVE: "กำลังใช้งาน", CLOSED: "ปิดแล้ว", DRAFT: "ฉบับร่าง" };
const ACTIVITY_STATUS: Record<ActivityStatus, string> = {
  DRAFT: "ฉบับร่าง", PUBLISHED: "เปิดรับลงทะเบียน", COMPLETED: "สิ้นสุดกิจกรรม", CANCELLED: "ยกเลิกกิจกรรม",
};

type ActivityOption = { id: string; title: string; dateLabel: string; status: ActivityStatus };

export function GreenStarsFilters({ area, years, selectedYearId, activityMode, activities = [], selectedActivityId }: {
  area: "admin" | "organizer";
  years: StudentYearOption[];
  selectedYearId: string | null;
  activityMode: boolean;
  activities?: ActivityOption[];
  selectedActivityId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);
  const selectClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50";

  function navigate(mode: boolean, yearId: string | null, activityId?: string) {
    const params = new URLSearchParams();
    if (yearId) params.set("academicYearId", yearId);
    if (mode && activityId) params.set("activityId", activityId);
    const path = `/${area}/green-stars${mode ? "/activities" : ""}`;
    startTransition(() => router.push(`${path}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  return (
    <section aria-label="เลือกงานช่วยเหลือ" aria-busy={pending} className="rounded-xl border bg-card p-4 sm:p-5">
      <div className={`grid gap-4 ${activityMode ? "sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]" : "sm:grid-cols-2"}`}>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="green-stars-year">ปีการศึกษา</Label>
          <select id="green-stars-year" value={selectedYearId ?? ""} disabled={pending || years.length === 0} className={selectClass}
            onChange={(event) => navigate(activityMode, event.target.value)}>
            {years.length === 0 && <option value="">ยังไม่มีปีการศึกษา</option>}
            {years.map((year) => <option key={year.id} value={year.id}>{year.code} · {YEAR_STATUS[year.status]}</option>)}
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="green-stars-work-type">ประเภทงานช่วยเหลือ</Label>
          <select id="green-stars-work-type" value={activityMode ? "activity" : "work"} disabled={pending} className={selectClass}
            onChange={(event) => navigate(event.target.value === "activity", selectedYearId)}>
            <option value="work">งานช่วยเหลือทั่วไป</option>
            <option value="activity">ช่วยเหลือกิจกรรม</option>
          </select>
        </div>
        {activityMode && <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="green-stars-activity">กิจกรรมที่ช่วยเหลือ <span className="font-normal text-muted-foreground">({activities.length} กิจกรรม)</span></Label>
          <select id="green-stars-activity" value={selectedActivityId ?? ""} disabled={pending || activities.length === 0} className={selectClass}
            onChange={(event) => navigate(true, selectedYearId, event.target.value)}>
            {activities.length === 0 && <option value="">ยังไม่มีกิจกรรมในปีการศึกษานี้</option>}
            {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title} · {activity.dateLabel}</option>)}
          </select>
        </div>}
      </div>
      {(pending || selectedActivity) && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        {pending ? <span role="status" className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />กำลังโหลดข้อมูล...</span>
          : selectedActivity && <>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{selectedActivity.dateLabel}</span><span>{ACTIVITY_STATUS[selectedActivity.status]}</span></p>
            <Link href={`/${area}/activities/${selectedActivity.id}?academicYearId=${selectedYearId}`} className="text-primary underline underline-offset-4">ดูรายละเอียดกิจกรรม</Link>
          </>}
      </div>}
    </section>
  );
}
