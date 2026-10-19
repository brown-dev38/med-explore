import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2, Clock, Gift, MapPin, QrCode, Sparkles, Star, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { formatThaiDateTime } from "@/lib/datetime";
import { getStudentYearContext } from "@/lib/student-academic-years";
import { isIncompleteCompletedParticipation, studentActivitiesHref, studentActivityWhere, type StudentYearPageProps } from "@/lib/student-activity-filters";
import { rewardBalance, rewardCatalog } from "@/lib/rewards";
import { totalAttendanceMinutes } from "@/lib/attendance-calculation";
import { StudentYearSelector } from "@/components/student-year-selector";
import { RewardGoals } from "@/components/reward-goals";
import { Button } from "@/components/ui/button";

const UPCOMING_LIMIT = 4;

export default function StudentDashboardPage({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center text-sm text-muted-foreground">กำลังโหลดข้อมูล...</div>}>
      <StudentDashboardContent searchParams={searchParams} target={target} />
    </Suspense>
  );
}

async function StudentDashboardContent({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  const { user, basePath, readOnly } = await getStudentDashboardContext(target);
  const { years, selectedYear } = await getStudentYearContext(searchParams);
  const now = new Date();

  const [
    participations, upcomingActivities, upcomingTotal, activityTotal, missedTotal, cancelledTotal,
    yellowStarTotal, greenStarTotal, helperDutiesTotal, standaloneWorkTotal,
    balance, redeemedStarTotal, rewards,
  ] = selectedYear ? await Promise.all([
    prisma.participation.findMany({
      where: { userId: BigInt(user.id), activity: { academicYearId: BigInt(selectedYear.id) } },
      include: { activity: true, attendanceRecords: true }, orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { academicYearId: BigInt(selectedYear.id), status: "DRAFT", endsAt: { gt: now } },
      orderBy: { startsAt: "asc" }, take: UPCOMING_LIMIT,
    }),
    prisma.activity.count({ where: { academicYearId: BigInt(selectedYear.id), status: "DRAFT", endsAt: { gt: now } } }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now) }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now, "missed") }),
    prisma.activity.count({ where: studentActivityWhere(selectedYear.id, user.id, now, "cancelled") }),
    prisma.starTransaction.aggregate({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "YELLOW", status: "APPROVED" }, _sum: { points: true } }),
    prisma.starTransaction.aggregate({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "GREEN", status: "APPROVED" }, _sum: { points: true } }),
    prisma.helperAssignment.count({ where: { userId: BigInt(user.id), activity: { academicYearId: BigInt(selectedYear.id) }, status: "COMPLETED" } }),
    prisma.starTransaction.count({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), starType: "GREEN", status: "APPROVED", points: { gt: 0 }, helperAssignmentId: null, participationId: null, redemptionId: null } }),
    rewardBalance(BigInt(user.id), BigInt(selectedYear.id)),
    prisma.starTransaction.aggregate({ where: { userId: BigInt(user.id), academicYearId: BigInt(selectedYear.id), status: "APPROVED", redemptionId: { not: null }, points: { lt: 0 } }, _sum: { points: true } }),
    readOnly ? Promise.resolve([]) : rewardCatalog(BigInt(selectedYear.id)),
  ]) : [[], [], 0, 0, 0, 0, { _sum: { points: 0 } }, { _sum: { points: 0 } }, 0, 0, { balance: 0, reserved: 0, available: 0 }, { _sum: { points: 0 } }, []];

  const incompleteParticipations = participations.filter(isIncompleteCompletedParticipation);
  const currentParticipations = participations.filter((participation) =>
    participation.activity.status === "PUBLISHED" &&
    participation.attendanceRecords.some((record) => record.eventType === "CHECK_IN" && record.occurredAt <= now) &&
    !participation.attendanceRecords.some((record) => record.eventType === "CHECK_OUT"),
  );
  const attendedCount = participations.filter((participation) =>
    participation.attendanceRecords.some((record) => record.eventType === "CHECK_IN") &&
    participation.attendanceRecords.some((record) => record.eventType === "CHECK_OUT"),
  ).length;
  const yellowStars = yellowStarTotal._sum.points ?? 0;
  const greenStars = greenStarTotal._sum.points ?? 0;
  const earnedStars = yellowStars + greenStars;
  const redeemedStars = Math.max(0, -(redeemedStarTotal._sum.points ?? 0));
  const rewardsHref = selectedYear ? `/dashboard/rewards?academicYearId=${selectedYear.id}` : "/dashboard/rewards";
  const redemptionsHref = selectedYear ? `/dashboard/redemptions?academicYearId=${selectedYear.id}` : "/dashboard/redemptions";
  const yearQuery = selectedYear ? `?academicYearId=${selectedYear.id}` : "";
  const canScan = selectedYear?.status === "ACTIVE";

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" aria-hidden="true" />ทุกกิจกรรม มีความหมาย</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{readOnly ? `ภาพรวมของ ${user.name}` : `สวัสดี, ${user.name ?? "นิสิต"}`}</h1>
          <p className="text-sm text-muted-foreground">{readOnly ? "กิจกรรม การช่วยงาน และดาวของนิสิตในปีการศึกษาที่เลือก" : "เก็บประสบการณ์ใหม่ ๆ แล้วเปลี่ยนดาวของคุณเป็นของรางวัล"}</p>
        </div>
        <div className="w-full sm:w-auto sm:min-w-72"><StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={basePath} /></div>
      </header>

      <section aria-labelledby="star-wallet-title" className="relative isolate overflow-hidden rounded-3xl border border-primary/15 bg-linear-to-br from-primary/10 via-card to-amber-50/60 dark:to-card">
        <Star className="pointer-events-none absolute -right-5 -top-6 -z-10 size-44 rotate-12 fill-amber-300/15 text-amber-400/15 sm:right-8" aria-hidden="true" />
        <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div>
            <h2 id="star-wallet-title" className="flex items-center gap-2 text-sm font-medium text-primary"><Star className="size-5 fill-amber-300 text-amber-500" aria-hidden="true" />ดาวที่ใช้แลกได้</h2>
            <p className="mt-3 flex items-baseline gap-3"><span data-star-value="available" className="text-6xl font-semibold tracking-tight text-primary tabular-nums sm:text-7xl">{balance.available}</span><span className="text-lg text-muted-foreground">ดาว</span></p>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">{selectedYear?.status === "CLOSED" ? "ปีการศึกษานี้ปิดแล้ว ยอดดาวคงเหลือเป็น 0 ดาวสะสมด้านข้างเป็นประวัติที่เคยได้รับ" : "ยอดพร้อมใช้ หลังหักดาวที่แลกและดาวที่จองรออนุมัติแล้ว"}</p>
            {selectedYear && <p className="mt-1 text-xs text-muted-foreground">เฉพาะปีการศึกษา {selectedYear.code}{selectedYear.status !== "ACTIVE" && " · ปีนี้ยังไม่เปิดให้แลกหรือปิดแล้ว"}</p>}
            {!selectedYear && <p className="mt-2 text-sm text-muted-foreground">ข้อมูลจะแสดงเมื่อมีปีการศึกษา</p>}
            {!readOnly && selectedYear && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button nativeButton={false} render={<Link href={rewardsHref} />} className="rounded-full px-5"><Gift className="size-4" />ดูของรางวัล<ArrowRight className="size-4" /></Button>
                <Link href={redemptionsHref} className="rounded-md px-2 py-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ประวัติการแลก</Link>
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <dl className="divide-y divide-primary/10 rounded-2xl bg-background/65 px-5">
              {[
                { label: "สะสมจากกิจกรรมและช่วยงาน", value: earnedStars, key: "earned", hint: "ยอดสะสม ไม่หักการแลก" },
                { label: "ใช้แลกรางวัลแล้ว", value: redeemedStars, key: "redeemed", hint: "เฉพาะรายการที่อนุมัติแล้ว" },
                { label: "จองรออนุมัติ", value: balance.reserved, key: "reserved", hint: "กันไว้สำหรับคำขอที่รอพิจารณา" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4 py-4">
                  <dt className="text-sm font-medium">{item.label}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{item.hint}</span></dt>
                  <dd className="shrink-0 text-sm"><span data-star-value={item.key} className="text-xl font-semibold tabular-nums">{item.value}</span><span className="ml-1 text-muted-foreground">ดาว</span></dd>
                </div>
              ))}
            </dl>
            {balance.reserved > 0 && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">คงเหลือก่อนหักส่วนจอง {balance.balance} ดาว · หากคำขอไม่อนุมัติหรือยกเลิกก่อนอนุมัติ ดาวที่จองจะกลับมาใช้แลกได้</p>}
          </div>
        </div>
      </section>

      {!readOnly && (
        <nav aria-label="ทางลัดของฉัน" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { href: `/dashboard/activities${yearQuery}`, title: "หากิจกรรมที่ชอบ", hint: "เปิดประสบการณ์ เก็บดาวเพิ่ม", icon: Sparkles, color: "bg-primary/10 text-primary" },
            ...(canScan ? [{ href: `/scan${yearQuery}`, title: "สแกน QR", hint: "เช็คอินหรือเช็คเอาท์กิจกรรม", icon: QrCode, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }] : []),
            { href: `${basePath}/my-activities${yearQuery}`, title: "กิจกรรมของฉัน", hint: "ดูการเข้าร่วมและการช่วยงาน", icon: Calendar, color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
          ].map(({ href, title, hint, icon: Icon, color }) => (
            <Link key={href} href={href} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-transparent bg-card px-4 py-4 transition-colors hover:border-primary/20 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${color}`}><Icon className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}

      {currentParticipations.length > 0 && (
        <section aria-labelledby="current-activities-title" className="rounded-2xl border border-primary/20 bg-card p-5 sm:p-6">
          <h2 id="current-activities-title" className="flex items-center gap-2 font-semibold"><QrCode className="size-5 text-primary" aria-hidden="true" />{!canScan ? "ประวัติกิจกรรมที่ยังไม่มีเช็คเอาท์" : readOnly ? "กิจกรรมที่กำลังเข้าร่วม" : "อย่าลืมเช็คเอาท์ก่อนกลับ"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">เช็คอินแล้ว {currentParticipations.length} กิจกรรม{canScan ? " · บันทึกเวลาออกให้ครบเพื่อรับดาว" : " · ปีการศึกษานี้ไม่เปิดให้บันทึกเวลา"}</p>
          <div className="mt-4 divide-y">
            {currentParticipations.map((participation) => {
              const checkIn = participation.attendanceRecords.find((record) => record.eventType === "CHECK_IN");
              return (
                <div key={String(participation.id)} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="break-words text-sm font-semibold">{participation.activity.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {checkIn && <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5" aria-hidden="true" />เข้า {formatThaiDateTime(checkIn.occurredAt.toISOString())}</span>}
                      {participation.activity.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{participation.activity.location}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">สิ้นสุด {formatThaiDateTime(participation.activity.endsAt.toISOString())}</p>
                  </div>
                  {!readOnly && canScan && <Button size="sm" nativeButton={false} render={<Link href={`/scan${yearQuery}`} />} className="shrink-0 rounded-full"><QrCode />สแกนเช็คเอาท์</Button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {incompleteParticipations.length > 0 && (
        <section aria-labelledby="incomplete-activities-title" className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
          <h2 id="incomplete-activities-title" className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden="true" />มี {incompleteParticipations.length} กิจกรรมที่บันทึกเวลาไม่ครบ</h2>
          <p className="mt-2 text-sm text-muted-foreground">กิจกรรมสิ้นสุดแล้ว แต่ยังไม่มีเวลาเช็คเอาท์ กรุณาติดต่อผู้จัดเพื่อตรวจสอบ รายการนี้ยังไม่นับเป็นเข้า–ออกครบหรือผ่านเกณฑ์รับดาว</p>
          <ul className="mt-3 space-y-2">{incompleteParticipations.map((participation) => <li key={String(participation.id)} className="break-words text-sm font-medium">{participation.activity.title}</li>)}</ul>
        </section>
      )}

      {!readOnly && selectedYear && <RewardGoals academicYearId={selectedYear.id} balance={balance} rewards={rewards} canRedeem={selectedYear.status === "ACTIVE"} />}

      <section aria-labelledby="experiences-title" className="space-y-5 border-t pt-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="experiences-title" className="text-lg font-semibold">{readOnly ? "ประสบการณ์ของนิสิต" : "ประสบการณ์ที่เก็บมา"}</h2><p className="mt-1 text-sm text-muted-foreground">ทุกครั้งที่เข้าร่วม คืออีกก้าวของการเรียนรู้</p></div>
          <Link href={`${basePath}/my-activities${yearQuery}`} className="inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ดูประวัติ<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">เข้าร่วมเข้า–ออกครบ</dt><dd className="mt-1 text-lg font-semibold">{attendedCount}<span className="ml-1 text-xs font-normal text-muted-foreground">กิจกรรม</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">ช่วยงานสำเร็จ</dt><dd className="mt-1 text-lg font-semibold">{helperDutiesTotal + standaloneWorkTotal}<span className="ml-1 text-xs font-normal text-muted-foreground">งาน</span></dd></div>
          <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" aria-hidden="true" />เวลาเข้าร่วมรวม</dt><dd className="mt-1 text-lg font-semibold">{totalAttendanceMinutes(participations)}<span className="ml-1 text-xs font-normal text-muted-foreground">นาที</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">ดาวที่ได้รับแต่ละสี</dt><dd className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium"><span className="flex items-center gap-1"><Star className="size-4 fill-amber-300 text-amber-600" aria-hidden="true" />เหลือง {yellowStars}</span><span className="flex items-center gap-1"><Star className="size-4 fill-emerald-300 text-emerald-600" aria-hidden="true" />เขียว {greenStars}</span></dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">ดาวสีเหลืองจากการเข้าร่วมสูงสุด 12 ดาวต่อปี · ดาวสีเขียวจากการช่วยงาน</p>
        {selectedYear && <nav aria-label="ดูกิจกรรมในปีการศึกษาที่เลือก" className="flex flex-wrap gap-2">
          {[
            { filter: "all" as const, label: "กิจกรรมทั้งหมด", count: activityTotal },
            { filter: "attended" as const, label: "เข้าร่วมแล้ว", count: attendedCount },
            { filter: "missed" as const, label: "พลาดไป", count: missedTotal },
            { filter: "cancelled" as const, label: "ยกเลิก", count: cancelledTotal },
          ].map((item) => <Link key={item.filter} href={studentActivitiesHref(selectedYear.id, item.filter, basePath)} className="rounded-full border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.label}<span className="ml-2 font-semibold text-foreground">{item.count}</span></Link>)}
        </nav>}
      </section>

      <section aria-labelledby="upcoming-title" className="space-y-4 border-t pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="upcoming-title" className="text-lg font-semibold">เร็ว ๆ นี้ มีอะไรน่าสนใจ</h2><p className="mt-1 text-sm text-muted-foreground">กิจกรรมที่กำลังเตรียมเปิดรับในปีการศึกษาที่เลือก</p></div>
          <Link href={selectedYear ? `${basePath}/upcoming?academicYearId=${selectedYear.id}` : `${basePath}/upcoming`} className="inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ดูทั้งหมด ({upcomingTotal})<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        {upcomingActivities.length === 0 ? (
          <div className="flex items-center gap-4 rounded-2xl bg-muted/40 p-5"><Calendar className="size-8 shrink-0 text-primary/50" aria-hidden="true" /><div><p className="text-sm font-medium">ยังไม่มีกิจกรรมที่เตรียมเปิดรับ</p><p className="mt-1 text-xs text-muted-foreground">{readOnly ? "ติดตามรายการใหม่ได้ที่หน้านี้" : "แวะดูหน้าลงทะเบียน อาจมีกิจกรรมที่เปิดรับอยู่แล้ว"}</p></div></div>
        ) : (
          <ul className="divide-y">{upcomingActivities.map((activity) => (
            <li key={String(activity.id)} className="flex gap-4 py-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary"><Calendar className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{activity.title}</h3><p className="mt-1 text-xs text-muted-foreground">{formatThaiDateTime(activity.startsAt.toISOString())} – {formatThaiDateTime(activity.endsAt.toISOString())}</p>{activity.location && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{activity.location}</p>}<p className="mt-2 text-xs font-medium text-primary">เตรียมเปิดรับ · ยังไม่เปิดลงทะเบียน</p></div>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
