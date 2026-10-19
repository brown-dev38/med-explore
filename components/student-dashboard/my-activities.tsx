import { Suspense } from "react";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  Star,
  Clock,
  Award,
  CheckCircle2,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { getStudentYearContext } from "@/lib/student-academic-years";
import { formatThaiDateTime } from "@/lib/datetime";
import { attendanceMinutesFromRecords } from "@/lib/attendance-calculation";
import { isIncompleteCompletedParticipation, type StudentYearPageProps } from "@/lib/student-activity-filters";
import { StudentYearSelector } from "@/components/student-year-selector";
import type { HelperStatus, ParticipationStatus } from "@/types/activity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";



const STATUS_CONFIG: Record<
  ParticipationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  REGISTERED: { label: "ลงทะเบียนแล้ว", variant: "secondary" },
  ATTENDED: { label: "เข้าร่วมแล้ว", variant: "default" },
  INCOMPLETE: { label: "ไม่ครบเงื่อนไข", variant: "outline" },
  ABSENT: { label: "ไม่เข้าร่วม", variant: "destructive" },
};

const HELPER_STATUS_CONFIG: Record<
  HelperStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ASSIGNED: { label: "กำลังช่วยงาน", variant: "secondary" },
  COMPLETED: { label: "ช่วยงานสำเร็จ", variant: "default" },
  CANCELLED: { label: "ยกเลิก", variant: "destructive" },
};

export default function MyActivitiesPage({ target, searchParams }: StudentYearPageProps & { target?: StudentTarget }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          กำลังโหลดข้อมูล...
        </div>
      }
    >
      <MyActivitiesContent target={target} searchParams={searchParams} />
    </Suspense>
  );
}

async function MyActivitiesContent({ target, searchParams }: StudentYearPageProps & { target?: StudentTarget }) {
  const { user, readOnly, basePath } = await getStudentDashboardContext(target);
  const { years, selectedYear } = await getStudentYearContext(searchParams);
  const activitiesHref = selectedYear ? `/dashboard/activities?academicYearId=${selectedYear.id}` : "/dashboard/activities";

  const [participations, helperDuties, standaloneWorks] = selectedYear ? await Promise.all([
    prisma.participation.findMany({
      where: { userId: BigInt(user.id), activity: { academicYearId: BigInt(selectedYear.id) } },
      include: { activity: true, attendanceRecords: true, starTransactions: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.helperAssignment.findMany({
      where: { userId: BigInt(user.id), activity: { academicYearId: BigInt(selectedYear.id) } },
      include: { activity: true, starTransactions: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.starTransaction.findMany({
      where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "GREEN", helperAssignmentId: null, participationId: null, redemptionId: null },
      include: { academicYear: { select: { code: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]) : [[], [], []];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {readOnly ? "กิจกรรมของนิสิต" : "กิจกรรมของฉัน"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {readOnly ? "รายการเข้าร่วมกิจกรรมและช่วยงานของนิสิตที่เลือก" : "รายการกิจกรรมที่คุณลงทะเบียนเข้าร่วม และหน้าที่ช่วยเหลือกิจกรรมเพื่อสะสมดาว"}
          </p>
        </div>
        <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={`${basePath}/my-activities`} />
      </div>
      {selectedYear?.status === "CLOSED" && <p role="status" className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">ปีการศึกษานี้ปิดแล้ว แสดงประวัติการเข้าร่วมและช่วยงานเฉพาะปี {selectedYear.code}</p>}
      {!readOnly && selectedYear?.status === "ACTIVE" && (<Button
          nativeButton={false}
          render={
            <Link href={activitiesHref} className="gap-2">
              <Sparkles className="h-4 w-4" />
              ลงทะเบียนกิจกรรมใหม่
            </Link>
          }
        />)}

      <Tabs defaultValue="participations" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="participations" className="gap-2">
            <Users className="h-4 w-4" />
            <span>กิจกรรมที่เข้าร่วม</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {participations.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="helpers" className="gap-2">
            <Award className="h-4 w-4 text-emerald-600" />
            <span>งานช่วยเหลือ (ดาวสีเขียว)</span>
            <Badge
              variant="secondary"
              className="ml-1 text-xs px-1.5 py-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              {helperDuties.length + standaloneWorks.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: กิจกรรมที่เข้าร่วม */}
        <TabsContent value="participations">
          {participations.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground/60 mb-3" />
                <p className="text-base font-semibold text-foreground">
                  {readOnly ? "นิสิตยังไม่มีประวัติลงทะเบียนกิจกรรม" : "ยังไม่มีกิจกรรมที่คุณลงทะเบียน"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
                  {readOnly ? "ประวัติจะแสดงเมื่อนิสิตลงทะเบียนกิจกรรม" : "สามารถดูกิจกรรมที่เปิดรับและสแกนเข้าร่วมได้ที่หน้ารวมกิจกรรม"}
                </p>
                {!readOnly && selectedYear?.status === "ACTIVE" && (<Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={activitiesHref} className="gap-1.5">
                      ดูกิจกรรมที่เปิดรับลงทะเบียน
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  }
                />)}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {participations.map((p) => {
                const checkIn = p.attendanceRecords.find(
                  (r) => r.eventType === "CHECK_IN",
                );
                const checkOut = p.attendanceRecords.find(
                  (r) => r.eventType === "CHECK_OUT",
                );
                const statusConfig = STATUS_CONFIG[p.status];
                const incomplete = isIncompleteCompletedParticipation(p);
                const attendedMinutes = attendanceMinutesFromRecords(p.attendanceRecords);
                const yellowStars = p.starTransactions
                  .filter((star) => star.starType === "YELLOW" && star.status === "APPROVED")
                  .reduce((sum, star) => sum + star.points, 0);

                return (
                  <Card
                    key={String(p.id)}
                    className="flex flex-col justify-between transition-all hover:shadow-md"
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-lg font-bold tracking-tight text-foreground line-clamp-2">
                          {p.activity.title}
                        </CardTitle>
                        <Badge
                          variant={incomplete ? "outline" : statusConfig.variant}
                          className="shrink-0"
                        >
                          {incomplete ? "บันทึกเวลาไม่ครบ" : statusConfig.label}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatThaiDateTime(p.activity.startsAt.toISOString())}
                        </div>
                        <div className="pl-5">
                          ถึง {formatThaiDateTime(p.activity.endsAt.toISOString())}
                        </div>
                        {p.activity.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {p.activity.location}
                          </div>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0">
                      <div className="rounded-lg bg-muted/40 p-3 text-xs border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">เวลาเช็คอิน:</span>
                          <span className="font-medium text-foreground">
                            {checkIn
                              ? formatThaiDateTime(checkIn.occurredAt.toISOString())
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2">
                          <span className="text-muted-foreground">เวลาเช็คเอาท์:</span>
                          <span className="font-medium text-foreground">
                            {checkOut
                              ? formatThaiDateTime(checkOut.occurredAt.toISOString())
                              : "—"}
                          </span>
                        </div>
                      </div>
                      {incomplete && (
                        <p className="mt-3 text-xs leading-relaxed text-amber-700">
                          กิจกรรมสิ้นสุดแล้วแต่ยังไม่มีเช็คเอาท์ กรุณาติดต่อผู้จัดเพื่อตรวจสอบและบันทึกเวลาออกตามจริง
                        </p>
                      )}
                      <div className="mt-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Clock className="size-3.5" />สรุปเวลาเข้าร่วม
                        </p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">
                          {attendedMinutes === null ? "—" : attendedMinutes}{" "}
                          <span className="text-sm font-normal text-muted-foreground">นาที</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          เกณฑ์ของกิจกรรมนี้ {p.activity.minMinutes} นาที
                          {attendedMinutes !== null
                            ? ` · ${attendedMinutes >= p.activity.minMinutes ? "ผ่านเกณฑ์เวลา" : "ยังไม่ครบเกณฑ์เวลา"}`
                            : checkIn && checkOut
                              ? " · เวลาเข้า–ออกไม่ถูกต้อง กรุณาติดต่อผู้จัด"
                              : " · รอบันทึกเช็คอิน–เช็คเอาท์ให้ครบ"}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">ดาวจากกิจกรรมนี้</span>
                        <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                          <Star className="size-3.5 fill-amber-400 text-amber-500" />
                          {yellowStars} ดาวสีเหลือง
                        </Badge>
                      </div>
                      {p.reviewNote && (
                        <p className="mt-2 text-xs text-muted-foreground">{p.reviewNote}</p>
                      )}
                      {!p.reviewNote &&
                        p.attendedMinutes === null &&
                        attendedMinutes !== null &&
                        attendedMinutes >= p.activity.minMinutes &&
                        p.activity.status !== "CANCELLED" &&
                        yellowStars === 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            รอผู้จัดตรวจสอบผลการรับดาว
                          </p>
                        )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: หน้าที่ช่วยเหลือกิจกรรม (ดาวเขียว) */}
        <TabsContent value="helpers">
          {helperDuties.length === 0 && standaloneWorks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Award className="h-10 w-10 text-emerald-500/60 mb-3" />
                <p className="text-base font-semibold text-foreground">
                  ยังไม่มีประวัติงานช่วยเหลือ
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  เมื่อคุณได้รับการมอบหมายให้เป็นผู้ช่วยงานในกิจกรรมต่างๆ
                  และปฏิบัติหน้าที่สำเร็จ จะได้รับ <strong>1 ดาวสีเขียว</strong> ต่องาน
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {helperDuties.map((duty) => {
                const statusConfig = HELPER_STATUS_CONFIG[duty.status];
                const greenStar = duty.starTransactions.find(
                  (star) => star.starType === "GREEN" && star.status === "APPROVED",
                );

                return (
                  <Card
                    key={String(duty.id)}
                    className="flex flex-col justify-between transition-all hover:shadow-md"
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-lg font-bold tracking-tight text-foreground line-clamp-2">
                          {duty.activity.title}
                        </CardTitle>
                        <Badge variant={statusConfig.variant} className="shrink-0">
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatThaiDateTime(duty.activity.startsAt.toISOString())}
                        </div>
                        <div className="pl-5">
                          ถึง {formatThaiDateTime(duty.activity.endsAt.toISOString())}
                        </div>
                        {duty.activity.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {duty.activity.location}
                          </div>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-3">
                      <div className="rounded-lg bg-muted/40 p-3 text-xs border">
                        <span className="text-muted-foreground block font-medium">หน้าที่ที่ได้รับมอบหมาย:</span>
                        <p className="font-semibold text-foreground mt-1">
                          {duty.description || "ผู้ช่วยงานกิจกรรมทั่วไป"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-sm border-t pt-3">
                        <span className="text-muted-foreground">ผลตอบแทน:</span>
                        {greenStar ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            ได้รับ 1 ดาวสีเขียว 💚
                          </Badge>
                        ) : duty.status === "COMPLETED" ? (
                          <Badge variant="secondary" className="text-xs">
                            รอการบันทึกดาวเขียว
                          </Badge>
                        ) : duty.status === "CANCELLED" ? (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            ยกเลิก
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            รอปฏิบัติงานเสร็จสิ้น
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {standaloneWorks.length > 0 && <section className="mt-5 space-y-3" aria-label="งานช่วยเหลือทั่วไป">
            <h2 className="text-base font-semibold">งานช่วยเหลือทั่วไป</h2>
            <div className="grid gap-5 md:grid-cols-2">{standaloneWorks.map((work) => <Card key={String(work.id)}>
              <CardHeader><CardTitle className="text-base whitespace-pre-wrap break-words">{work.reason ?? "งานช่วยเหลือทั่วไป"}</CardTitle><p className="text-xs text-muted-foreground">ปีการศึกษา {work.academicYear.code} · {formatThaiDateTime(work.createdAt.toISOString())}</p></CardHeader>
              <CardContent><Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-400"><Award className="size-4" />{work.status === "APPROVED" ? `${work.points} ดาวสีเขียว` : "ยกเลิก / ยังไม่อนุมัติ"}</Badge></CardContent>
            </Card>)}</div>
          </section>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
