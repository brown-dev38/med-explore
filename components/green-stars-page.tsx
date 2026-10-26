import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess, requireOrganizerAccess } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getHelpersForActivity } from "@/lib/helpers";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentSearchParams } from "@/lib/student-activity-filters";
import { StudentYearSelector } from "@/components/student-year-selector";
import { GreenStarManager } from "@/components/green-star-manager";
import { GreenWorkAwardForm } from "@/components/green-work-award-form";
import { GreenWorkHistory } from "@/components/green-work-history";
import { GreenStarExcelImport } from "@/components/green-star-excel-import";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const activityDateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok",
});

export type GreenStarsPageProps = { searchParams: Promise<StudentSearchParams> };

export function GreenStarsPage(props: GreenStarsPageProps & { area: "admin" | "organizer"; activityMode?: boolean }) {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลนิสิตช่วยงาน...</p>}><GreenStarsContent {...props} /></Suspense>;
}

async function GreenStarsContent({ area, searchParams, activityMode = false }: GreenStarsPageProps & { area: "admin" | "organizer"; activityMode?: boolean }) {
  const actor = area === "admin" ? await requireAdminAccess() : await requireOrganizerAccess();
  if (activityMode && !hasPermission(actor, PERMISSIONS.ACTIVITY_MANAGE)) redirect("/forbidden");
  const { years, selectedYear, searchParams: params } = await getStudentYearContext(searchParams);
  const rootPath = `/${area}/green-stars`;
  const basePath = activityMode ? `${rootPath}/activities` : rootPath;
  const suffix = selectedYear ? `?academicYearId=${selectedYear.id}` : "";
  const navigation = <nav aria-label="ประเภทงานช่วยเหลือ" className="flex flex-wrap gap-4 text-sm"><Link href={`${rootPath}${suffix}`} aria-current={!activityMode ? "page" : undefined} className={!activityMode ? "font-semibold text-primary underline underline-offset-4" : "text-muted-foreground"}>งานช่วยเหลือทั่วไป</Link><Link href={`${rootPath}/activities${suffix}`} aria-current={activityMode ? "page" : undefined} className={activityMode ? "font-semibold text-primary underline underline-offset-4" : "text-muted-foreground"}>ช่วยงานกิจกรรม</Link></nav>;
  if (!activityMode) {
    const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
    const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
    return <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">ดาวสีเขียว / นิสิตช่วยงาน</h1><p className="mt-1 text-sm text-muted-foreground">บันทึกงานช่วยเหลือทั่วไปและให้ดาวสีเขียวแก่นิสิต</p></div>
      {navigation}
      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={basePath} />
      {selectedYear ? <><GreenWorkAwardForm key={selectedYear.id} yearId={selectedYear.id} yearCode={selectedYear.code} closed={selectedYear.status === "CLOSED"} /><GreenStarExcelImport key={`import-${selectedYear.id}`} target={{ mode: "work", academicYearId: selectedYear.id }} targetLabel={`ปีการศึกษา ${selectedYear.code}`} disabled={selectedYear.status === "CLOSED"} /><GreenWorkHistory yearId={selectedYear.id} basePath={basePath} query={query} requestedPage={page} /></>
        : <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">เพิ่มปีการศึกษาเพื่อเริ่มบันทึกงานช่วยเหลือและให้ดาวสีเขียว</p>}
    </div>;
  }
  if (Array.isArray(params.activityId)) notFound();
  const activities = selectedYear ? await prisma.activity.findMany({
    where: { academicYearId: BigInt(selectedYear.id) },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  }) : [];
  const selected = params.activityId ? activities.find((activity) => String(activity.id) === params.activityId) : activities[0];
  if (params.activityId && !selected) notFound();
  const helpers = selected ? await getHelpersForActivity(selected.id) : [];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">ดาวสีเขียว / นิสิตช่วยงาน</h1><p className="mt-1 text-sm text-muted-foreground">มอบหมายนิสิตช่วยงานและยืนยันให้ 1 ดาวสีเขียวต่อกิจกรรม</p></div>
      {navigation}
      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={basePath} />
      {selectedYear && <form action={basePath} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <input type="hidden" name="academicYearId" value={selectedYear.id} />
        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="helper-activity">กิจกรรมที่ช่วยงาน</Label>
          <select id="helper-activity" name="activityId" defaultValue={selected ? String(selected.id) : ""} key={selected ? String(selected.id) : "empty"} disabled={activities.length === 0} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
            {activities.length === 0 && <option value="">ยังไม่มีกิจกรรมในปีการศึกษานี้</option>}
            {activities.map((activity) => <option key={String(activity.id)} value={String(activity.id)}>{activity.title} · {activityDateFormatter.formatRange(activity.startsAt, activity.endsAt)}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={activities.length === 0}>แสดงรายชื่อผู้ช่วยงาน</Button>
      </form>}
      {selected && selectedYear ? <GreenStarManager key={String(selected.id)} activityId={String(selected.id)} activityTitle={selected.title} yearId={selectedYear.id} closed={selectedYear.status === "CLOSED"} initialHelpers={helpers} />
        : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{selectedYear ? "เพิ่มกิจกรรมในปีการศึกษานี้เพื่อเริ่มมอบหมายนิสิตช่วยงาน" : "เพิ่มปีการศึกษาและกิจกรรมเพื่อเริ่มมอบหมายนิสิตช่วยงาน"}</p>}
    </div>
  );
}
