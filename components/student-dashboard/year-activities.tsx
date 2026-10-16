import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { formatThaiDateTime } from "@/lib/datetime";
import { getStudentYearContext } from "@/lib/student-academic-years";
import {
  studentActivitiesHref,
  studentActivityWhere,
  isIncompleteCompletedParticipation,
  type StudentActivityFilter,
  type StudentYearPageProps,
} from "@/lib/student-activity-filters";
import type { ActivityStatus } from "@/types/activity";
import { StudentYearSelector } from "@/components/student-year-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";



const FILTERS: { value: StudentActivityFilter; label: string; description: string }[] = [
  { value: "all", label: "กิจกรรมทั้งหมด", description: "กิจกรรมทุกสถานะในปีที่เลือก รวมรายการที่คุณไม่ได้ลงทะเบียน" },
  { value: "missed", label: "กิจกรรมที่พลาดไป", description: "กิจกรรมที่สิ้นสุดแล้วและคุณไม่มีบันทึกเช็คอิน รวมรายการที่ไม่ได้ลงทะเบียน โดยไม่นับฉบับร่างหรือกิจกรรมที่ถูกยกเลิก" },
  { value: "attended", label: "เข้าร่วมแล้ว", description: "กิจกรรมที่คุณมีบันทึกเช็คอินและเช็คเอาท์ครบในปีที่เลือก ยังไม่ได้หมายถึงผ่านเกณฑ์รับดาว" },
  { value: "cancelled", label: "กิจกรรมที่ถูกยกเลิก", description: "กิจกรรมที่ถูกยกเลิกทั้งหมดในปีที่เลือก รวมรายการที่คุณไม่ได้ลงทะเบียน โดยไม่นับเป็นกิจกรรมที่พลาดไป" },
];

const STATUS: Record<ActivityStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
  DRAFT: { label: "ฉบับร่าง", variant: "secondary" },
  PUBLISHED: { label: "เปิดรับลงทะเบียน", variant: "default" },
  COMPLETED: { label: "สิ้นสุดกิจกรรม", variant: "outline" },
  CANCELLED: { label: "ยกเลิกกิจกรรม", variant: "destructive" },
};

export default function YearActivitiesPage({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  return (
    <Suspense fallback={<div role="status" className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดกิจกรรม...</div>}>
      <YearActivitiesContent searchParams={searchParams} target={target} />
    </Suspense>
  );
}

async function YearActivitiesContent({ searchParams: params, target }: StudentYearPageProps & { target?: StudentTarget }) {
  const { user, basePath } = await getStudentDashboardContext(target);
  const { years, selectedYear, searchParams } = await getStudentYearContext(params);
  const filter = FILTERS.find((item) => item.value === (searchParams.filter ?? "all"));
  if (!filter) notFound();
  const now = new Date();

  const activities = selectedYear ? await prisma.activity.findMany({
    where: studentActivityWhere(selectedYear.id, user.id, now, filter.value),
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    include: {
      participations: {
        where: { userId: BigInt(user.id) },
        select: {
          id: true,
          attendanceRecords: { select: { eventType: true, occurredAt: true } },
        },
      },
    },
  }) : [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" render={<Link href={selectedYear ? `${basePath}?academicYearId=${selectedYear.id}` : basePath} />}>
        <ArrowLeft />กลับหน้าภาพรวม
      </Button>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{filter.label}</h1>
        <p className="text-sm text-muted-foreground">{filter.description}</p>
      </div>
      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={`${basePath}/year-activities`} filter={filter.value} />

      {selectedYear && (
        <nav aria-label="กรองกิจกรรม" className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button key={item.value} size="sm" variant={item.value === filter.value ? "default" : "outline"}
              render={<Link href={studentActivitiesHref(selectedYear.id, item.value, basePath)} aria-current={item.value === filter.value ? "page" : undefined} />}
            >{item.label}</Button>
          ))}
        </nav>
      )}

      <p className="text-sm text-muted-foreground">
        {selectedYear ? `ปีการศึกษา ${selectedYear.code} · ${activities.length} กิจกรรม` : "ยังไม่มีปีการศึกษาในระบบ"}
      </p>

      {activities.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CalendarDays className="size-9 text-muted-foreground" />
            <p className="font-medium">{selectedYear ? "ไม่พบกิจกรรมตามเงื่อนไขในปีที่เลือก" : "ยังไม่มีข้อมูลปีการศึกษา"}</p>
            <p className="text-sm text-muted-foreground">{selectedYear ? "ลองเลือกปีการศึกษาหรือเปลี่ยนตัวกรองด้านบน" : "ข้อมูลจะแสดงเมื่อผู้ดูแลเพิ่มปีการศึกษา"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {activities.map((activity) => {
            const status = activity.status === "PUBLISHED" && activity.endsAt <= now
              ? { label: "สิ้นสุดตามกำหนดเวลา", variant: "outline" as const }
              : STATUS[activity.status];
            const mine = activity.participations[0];
            const incomplete = mine ? isIncompleteCompletedParticipation({ activity, attendanceRecords: mine.attendanceRecords }) : false;
            const checkIn = mine?.attendanceRecords.find((record) => record.eventType === "CHECK_IN");
            const checkOut = mine?.attendanceRecords.find((record) => record.eventType === "CHECK_OUT");
            return (
              <Card key={String(activity.id)}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {filter.value === "missed" && <Badge variant="destructive">พลาดกิจกรรมนี้</Badge>}
                    {incomplete && <Badge variant="outline" className="border-amber-500/40 text-amber-700">บันทึกเวลาไม่ครบ</Badge>}
                  </div>
                  <CardTitle className="mt-2 text-lg font-semibold">{activity.title}</CardTitle>
                  {activity.description && <CardDescription className="whitespace-pre-line break-words leading-relaxed">{activity.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="sr-only">ช่วงเวลา</dt><dd>{formatThaiDateTime(activity.startsAt.toISOString())}<br /><span className="text-muted-foreground">ถึง {formatThaiDateTime(activity.endsAt.toISOString())}</span></dd></div></div>
                    {activity.location && <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="sr-only">สถานที่</dt><dd className="break-words">{activity.location}</dd></div></div>}
                    <div className="flex items-center gap-2 text-muted-foreground"><Clock className="size-4" /><dt>เกณฑ์เวลา</dt><dd>{activity.minMinutes} นาที</dd></div>
                  </dl>
                  <div className="space-y-1 rounded-xl border bg-muted/40 p-3 text-xs">
                    <p className="font-medium">{checkIn && checkOut ? "บันทึกเวลาเข้า–ออกครบแล้ว" : checkIn ? "มีบันทึกเช็คอิน" : mine ? "ลงทะเบียนแล้ว ยังไม่มีบันทึกเช็คอิน" : "ไม่มีประวัติลงทะเบียน"}</p>
                    {checkIn && <p className="text-muted-foreground">เช็คอิน: {formatThaiDateTime(checkIn.occurredAt.toISOString())}</p>}
                    {checkOut && <p className="text-muted-foreground">เช็คเอาท์: {formatThaiDateTime(checkOut.occurredAt.toISOString())}</p>}
                    {incomplete && <p className="pt-2 text-amber-700">กิจกรรมสิ้นสุดแล้ว กรุณาติดต่อผู้จัดเพื่อตรวจสอบและบันทึกเวลาออกตามจริง</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
