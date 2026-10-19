import { Suspense } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  MapPin,
  CalendarX,
  QrCode,
  Ban,
  TriangleAlert,
  Clock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { formatThaiDateTime } from "@/lib/datetime";
import { getStudentYearContext } from "@/lib/student-academic-years";
import { isIncompleteCompletedParticipation, studentActivitiesHref, studentActivityWhere, type StudentYearPageProps } from "@/lib/student-activity-filters";
import { StudentYearSelector } from "@/components/student-year-selector";
import { RewardGoals } from "@/components/reward-goals";
import { totalAttendanceMinutes } from "@/lib/attendance-calculation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";



const UPCOMING_LIMIT = 4;

export default function StudentDashboardPage({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          กำลังโหลดข้อมูล...
        </div>
      }
    >
      <StudentDashboardContent searchParams={searchParams} target={target} />
    </Suspense>
  );
}

async function StudentDashboardContent({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  const { user, basePath, readOnly } = await getStudentDashboardContext(target);
  const now = new Date();

  const { years, selectedYear } = await getStudentYearContext(searchParams);

  const [
    participations,
    upcomingActivities,
    upcomingTotal,
    activityTotal,
    missedTotal,
    cancelledTotal,
    yellowStarTotal,
    greenStarTotal,
    helperDutiesTotal,
    standaloneWorkTotal,
  ] = selectedYear ? await Promise.all([
    prisma.participation.findMany({
      where: {
        userId: BigInt(user.id),
        activity: { academicYearId: BigInt(selectedYear.id) },
      },
      include: { activity: true, attendanceRecords: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: {
        academicYearId: BigInt(selectedYear.id),
        status: "DRAFT",
        endsAt: { gt: now },
      },
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
    }),
    prisma.activity.count({
      where: {
        academicYearId: BigInt(selectedYear.id),
        status: "DRAFT",
        endsAt: { gt: now },
      },
    }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now) }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now, "missed") }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now, "cancelled") }),
    prisma.starTransaction.aggregate({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "YELLOW", status: "APPROVED" }, _sum: { points: true } }),
    prisma.starTransaction.aggregate({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "GREEN", status: "APPROVED" }, _sum: { points: true } }),
    prisma.helperAssignment.count({ where: { userId: BigInt(user.id), activity: { academicYearId: BigInt(selectedYear.id) }, status: "COMPLETED" } }),
    prisma.starTransaction.count({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "GREEN", status: "APPROVED", points: { gt: 0 }, helperAssignmentId: null, participationId: null, redemptionId: null } }),
  ]) : [[], [], 0, 0, 0, 0, { _sum: { points: 0 } }, { _sum: { points: 0 } }, 0, 0];

  const incompleteParticipations = participations.filter(isIncompleteCompletedParticipation);

  const currentParticipations = participations.filter((participation) =>
    participation.activity.status === "PUBLISHED" &&
    participation.attendanceRecords.some((record) =>
      record.eventType === "CHECK_IN" && record.occurredAt <= now,
    ) &&
    !participation.attendanceRecords.some((record) => record.eventType === "CHECK_OUT"),
  );

  const attendedCount = participations.filter((p) =>
    p.attendanceRecords.some((record) => record.eventType === "CHECK_IN") &&
    p.attendanceRecords.some((record) => record.eventType === "CHECK_OUT"),
  ).length;

  const yellowStars = yellowStarTotal._sum.points ?? 0;
  const greenStars = greenStarTotal._sum.points ?? 0;
  const totalStars = yellowStars + greenStars;

  const stats = [
    {
      label: "ดาวรวมสะสม", value: totalStars,
      hint: `ได้รับปีนี้: เหลือง ${yellowStars} + เขียว ${greenStars} ดาว`, href: !readOnly && selectedYear ? `/dashboard/rewards?academicYearId=${selectedYear.id}` : `${basePath}/my-activities`,
      icon: Sparkles, color: "text-amber-500", bg: "bg-amber-500/10",
    },
    {
      label: "ดาวสีเขียว (ช่วยงาน)", value: greenStars,
      hint: `ช่วยงานสำเร็จ ${helperDutiesTotal + standaloneWorkTotal} งาน`, href: `${basePath}/my-activities`,
      icon: Sparkles, color: "text-emerald-500", bg: "bg-emerald-500/10",
    },
    {
      label: "ดาวสีเหลือง (เข้าร่วม)", value: yellowStars,
      hint: "สูงสุด 12 ดาวต่อปีการศึกษา", href: `${basePath}/my-activities`,
      icon: Sparkles, color: "text-amber-500", bg: "bg-amber-500/10",
    },
    {
      label: "เวลาเข้าร่วมรวม", value: `${totalAttendanceMinutes(participations)} นาที`,
      hint: "รวมเวลาเข้า–ออกครบในปีการศึกษาที่เลือก", href: null,
      icon: Clock, color: "text-sky-500", bg: "bg-sky-500/10",
    },
    {
      label: "กิจกรรมทั้งหมด",
      value: activityTotal,
      hint: "ดูกิจกรรมทุกสถานะของปีที่เลือก",
      href: selectedYear ? studentActivitiesHref(selectedYear.id, "all", basePath) : null,
      icon: CalendarDays,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
    {
      label: "เข้าร่วมแล้ว",
      value: attendedCount,
      hint: "มีบันทึกเช็คอินและเช็คเอาท์ครบ",
      href: selectedYear ? studentActivitiesHref(selectedYear.id, "attended", basePath) : null,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "กิจกรรมที่พลาดไป",
      value: missedTotal,
      hint: "สิ้นสุดแล้ว และไม่มีบันทึกเช็คอิน",
      href: selectedYear ? studentActivitiesHref(selectedYear.id, "missed", basePath) : null,
      icon: CalendarX,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
    {
      label: "กิจกรรมที่ถูกยกเลิก",
      value: cancelledTotal,
      hint: "รายการที่ถูกยกเลิกในปีที่เลือก",
      href: selectedYear ? studentActivitiesHref(selectedYear.id, "cancelled", basePath) : null,
      icon: Ban,
      color: "text-slate-500",
      bg: "bg-slate-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {readOnly ? "ภาพรวมของนิสิต" : "ภาพรวมของฉัน"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {readOnly ? `ข้อมูลกิจกรรมและดาวสะสมของ ${user.name}` : `ยินดีต้อนรับคุณ ${user.name ?? "นิสิต"} สะสมดาวเพื่อแลกของรางวัลกิจกรรม`}
          </p>
          <Badge variant="secondary" className="mt-3">
            {selectedYear ? `ปีการศึกษา ${selectedYear.code}` : "ยังไม่มีปีการศึกษา"}
          </Badge>
        </div>
        {!readOnly && (<Button
          render={
            <Link href="/dashboard/activities" className="gap-2">
              <Sparkles className="h-4 w-4" />
              ลงทะเบียนกิจกรรมใหม่
            </Link>
          }
        />)}
      </div>

      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={basePath} />

      {!readOnly && selectedYear && <RewardGoals userId={user.id} academicYearId={selectedYear.id} />}

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg font-semibold">กิจกรรมที่เข้าร่วมปัจจุบัน</CardTitle>
            <Badge variant="secondary">{currentParticipations.length} กิจกรรม</Badge>
          </div>
          <CardDescription>
            กิจกรรมในปีที่เลือกที่เช็คอินแล้วและยังรอเช็คเอาท์
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {currentParticipations.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              {selectedYear ? "ยังไม่มีกิจกรรมที่เช็คอินแล้วและรอเช็คเอาท์ในปีที่เลือก" : "ข้อมูลจะแสดงเมื่อผู้ดูแลเพิ่มปีการศึกษา"}
            </p>
          ) : (
            <div className="divide-y">
              {currentParticipations.map((participation) => {
                const checkIn = participation.attendanceRecords.find((record) => record.eventType === "CHECK_IN");
                return (
                  <div key={String(participation.id)} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <p className="break-words font-semibold">{participation.activity.title}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        {checkIn && <span className="flex items-center gap-1.5 text-primary"><CheckCircle2 className="size-3.5 shrink-0" />เช็คอิน: {formatThaiDateTime(checkIn.occurredAt.toISOString())}</span>}
                        {participation.activity.location && <span className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" />{participation.activity.location}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">กำหนดสิ้นสุด: {formatThaiDateTime(participation.activity.endsAt.toISOString())}</p>
                    </div>
                    {!readOnly && (<Button size="sm" render={<Link href="/scan" />}>
                      <QrCode />สแกน QR Check-out
                    </Button>)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {incompleteParticipations.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold"><TriangleAlert className="size-5 text-amber-600" />กิจกรรมที่บันทึกเวลาไม่ครบ</CardTitle>
              <Badge variant="outline">{incompleteParticipations.length} กิจกรรม</Badge>
            </div>
            <CardDescription>
              ผู้จัดสิ้นสุดกิจกรรมแล้ว แต่ยังไม่มีเวลาเช็คเอาท์ กรุณาติดต่อผู้จัดเพื่อตรวจสอบและบันทึกเวลาออกตามจริง รายการเหล่านี้ยังไม่นับเป็นเข้า–ออกครบหรือผ่านเกณฑ์รับดาว
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {incompleteParticipations.map((participation) => {
              const checkIn = participation.attendanceRecords.find((record) => record.eventType === "CHECK_IN");
              return (
                <div key={String(participation.id)} className="space-y-1 rounded-xl border bg-card p-3">
                  <p className="break-words text-sm font-semibold">{participation.activity.title}</p>
                  <p className="text-xs text-muted-foreground">เช็คอิน: {checkIn ? formatThaiDateTime(checkIn.occurredAt.toISOString()) : "—"} · ยังไม่มีเวลาเช็คเอาท์</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const content = (
              <Card className={`h-full transition-all ${stat.href ? "hover:border-primary/50 hover:shadow-md" : ""}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </span>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight text-foreground">
                    {stat.value}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.hint}
                  </p>
                </CardContent>
              </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="group">{content}</Link>
          ) : <div key={stat.label}>{content}</div>;
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">
              กิจกรรมที่กำลังจะมาถึง
            </CardTitle>
            <CardDescription className="text-xs">
              กิจกรรมฉบับร่างที่เตรียมเปิดให้เข้าร่วมในปีที่เลือก
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link href={selectedYear ? `${basePath}/upcoming?academicYearId=${selectedYear.id}` : `${basePath}/upcoming`} className="gap-1 text-xs">
                ดูทั้งหมด ({upcomingTotal})
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
        </CardHeader>
        <CardContent className="p-0">
          {upcomingActivities.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีกิจกรรมฉบับร่างที่กำลังจะมาถึงในปีที่เลือก
            </div>
          ) : (
            <div className="divide-y">
              {upcomingActivities.map((activity) => (
                <div
                  key={String(activity.id)}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">
                        {activity.title}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        ฉบับร่าง
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatThaiDateTime(activity.startsAt.toISOString())} &rarr;{" "}
                        {formatThaiDateTime(activity.endsAt.toISOString())}
                      </span>
                      {activity.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {activity.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground">
                      ยังไม่เปิดรับ
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
