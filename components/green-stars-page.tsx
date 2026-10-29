import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess, requireOrganizerAccess } from "@/lib/dal";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getHelpersForActivity } from "@/lib/helpers";
import { getStandaloneGreenStarCandidates } from "@/lib/green-star-work";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentSearchParams } from "@/lib/student-activity-filters";
import { GreenStarsFilters } from "@/components/green-stars-filters";
import { GreenStarManager } from "@/components/green-star-manager";
import { GreenWorkActions } from "@/components/green-work-actions";
import { GreenWorkHistory } from "@/components/green-work-history";

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
  if (!activityMode) {
    const initialCandidates = selectedYear && selectedYear.status !== "CLOSED" ? await getStandaloneGreenStarCandidates() : [];
    const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
    const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
    const pageSize = typeof params.pageSize === "string" ? Number(params.pageSize) : undefined;
    return <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">ดาวสีเขียว / นิสิตช่วยงาน</h1><p className="mt-1 text-sm text-muted-foreground">บันทึกงานช่วยเหลือทั่วไปและให้ดาวสีเขียวแก่นิสิต</p></div>
      <GreenStarsFilters area={area} years={years} selectedYearId={selectedYear?.id ?? null} activityMode={false} />
      {selectedYear ? <>
        <GreenWorkActions key={selectedYear.id} yearId={selectedYear.id} yearCode={selectedYear.code} closed={selectedYear.status === "CLOSED"} initialCandidates={initialCandidates} />
        <GreenWorkHistory yearId={selectedYear.id} yearCode={selectedYear.code} basePath={basePath} query={query} requestedPage={page} requestedPageSize={pageSize} />
      </>
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
      <GreenStarsFilters area={area} years={years} selectedYearId={selectedYear?.id ?? null} activityMode
        selectedActivityId={selected ? String(selected.id) : undefined}
        activities={activities.map((activity) => ({ id: String(activity.id), title: activity.title, status: activity.status, dateLabel: activityDateFormatter.formatRange(activity.startsAt, activity.endsAt) }))} />
      {selected && selectedYear ? <GreenStarManager key={String(selected.id)} activityId={String(selected.id)} activityTitle={selected.title} yearId={selectedYear.id} closed={selectedYear.status === "CLOSED"} initialHelpers={helpers} />
        : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{selectedYear ? "เพิ่มกิจกรรมในปีการศึกษานี้เพื่อเริ่มมอบหมายนิสิตช่วยงาน" : "เพิ่มปีการศึกษาและกิจกรรมเพื่อเริ่มมอบหมายนิสิตช่วยงาน"}</p>}
    </div>
  );
}
