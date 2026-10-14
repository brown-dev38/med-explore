import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { formatThaiDateTime } from "@/lib/datetime";

export const metadata = {
  title: "แดชบอร์ด | MedExplore Star",
};

const UPCOMING_LIMIT = 4;

export default function StudentDashboardPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <StudentDashboardContent />
    </Suspense>
  );
}

async function StudentDashboardContent() {
  const user = await requireAuth();
  const now = new Date();

  const [participations, upcomingActivities, upcomingTotal] = await Promise.all([
    prisma.participation.findMany({
      where: { userId: BigInt(user.id) },
      include: { activity: true, attendanceRecords: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: {
        status: { in: ["DRAFT", "PUBLISHED"] },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
    }),
    prisma.activity.count({
      where: {
        status: { in: ["DRAFT", "PUBLISHED"] },
        endsAt: { gte: now },
      },
    }),
  ]);

  const registeredUpcoming = participations.filter(
    (p) => p.activity.endsAt >= now,
  ).length;
  const attendedCount = participations.filter((p) =>
    p.attendanceRecords.some((record) => record.eventType === "CHECK_IN"),
  ).length;

  const stats = [
    {
      label: "กิจกรรมที่ลงทะเบียน",
      value: participations.length,
      hint: "รายการทั้งหมด",
      href: "/dashboard/my-activities",
    },
    {
      label: "รอเข้าร่วม",
      value: registeredUpcoming,
      hint: "กิจกรรมที่ยังไม่สิ้นสุด",
      href: "/dashboard/my-activities",
    },
    {
      label: "เข้าร่วมแล้ว",
      value: attendedCount,
      hint: "มีบันทึกเช็คอิน",
      href: "/dashboard/my-activities",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            ภาพรวมของฉัน
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            ยินดีต้อนรับ {user.name ?? "นิสิต"}
          </p>
        </div>
        <Link
          href="/dashboard/activities"
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500"
        >
          ลงทะเบียนกิจกรรมใหม่
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {stat.hint}
            </p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            กิจกรรมที่กำลังจะมาถึง
          </h2>
          <Link
            href="/dashboard/upcoming"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            ดูทั้งหมด ({upcomingTotal})
          </Link>
        </div>

        {upcomingActivities.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            ยังไม่มีกิจกรรมที่กำลังจะมาถึง
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-neutral-800">
            {upcomingActivities.map((activity) => (
              <li
                key={String(activity.id)}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {activity.title}
                    </p>
                    {activity.status === "DRAFT" ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        ฉบับร่าง
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        เปิดรับลงทะเบียน
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatThaiDateTime(activity.startsAt.toISOString())} →{" "}
                    {formatThaiDateTime(activity.endsAt.toISOString())}
                    {activity.location ? ` · ${activity.location}` : ""}
                  </p>
                </div>
                {activity.status === "PUBLISHED" ? (
                  <Link
                    href="/dashboard/activities"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    ลงทะเบียน
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">
                    ยังไม่เปิดรับลงทะเบียน
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
