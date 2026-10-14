import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { formatThaiDateTime } from "@/lib/datetime";

export const metadata = {
  title: "กิจกรรมที่จะมาถึง | MedExplore Star",
};

export default function UpcomingActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <UpcomingActivitiesContent />
    </Suspense>
  );
}

async function UpcomingActivitiesContent() {
  await requireAuth();
  const now = new Date();

  const activities = await prisma.activity.findMany({
    where: {
      status: { in: ["DRAFT", "PUBLISHED"] },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          กิจกรรมที่จะมาถึงทั้งหมด
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          กิจกรรมที่กำลังจะมาถึง (รวมฉบับร่างที่ยังไม่เปิดรับลงทะเบียน)
        </p>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-400">
          ยังไม่มีกิจกรรมที่กำลังจะมาถึง
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activities.map((activity) => (
            <div
              key={String(activity.id)}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {activity.title}
                </h2>
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
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {formatThaiDateTime(activity.startsAt.toISOString())} →{" "}
                {formatThaiDateTime(activity.endsAt.toISOString())}
              </p>
              {activity.location && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  สถานที่: {activity.location}
                </p>
              )}
              <div className="mt-4">
                {activity.status === "PUBLISHED" ? (
                  <Link
                    href="/dashboard/activities"
                    className="inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500"
                  >
                    ไปหน้าลงทะเบียน
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500 dark:bg-neutral-800 dark:text-slate-400">
                    ยังไม่เปิดรับลงทะเบียน
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
