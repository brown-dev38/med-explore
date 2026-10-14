import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { formatThaiDateTime } from "@/lib/datetime";
import type { ParticipationStatus } from "@/types/activity";

export const metadata = {
  title: "กิจกรรมของฉัน | MedExplore Star",
};

const STATUS_LABEL: Record<ParticipationStatus, string> = {
  REGISTERED: "ลงทะเบียนแล้ว",
  ATTENDED: "เข้าร่วมแล้ว",
  INCOMPLETE: "ไม่ครบเงื่อนไข",
  ABSENT: "ไม่เข้าร่วม",
};

const STATUS_STYLE: Record<ParticipationStatus, string> = {
  REGISTERED:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  ATTENDED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  INCOMPLETE:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  ABSENT: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

export default function MyActivitiesPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <MyActivitiesContent />
    </Suspense>
  );
}

async function MyActivitiesContent() {
  const user = await requireAuth();

  const participations = await prisma.participation.findMany({
    where: { userId: BigInt(user.id) },
    include: { activity: true, attendanceRecords: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            กิจกรรมของฉัน
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            รายการกิจกรรมที่คุณลงทะเบียนและสถานะการเข้าร่วม
          </p>
        </div>
        <Link
          href="/dashboard/activities"
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500"
        >
          ลงทะเบียนกิจกรรมใหม่
        </Link>
      </div>

      {participations.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-400">
          ยังไม่มีกิจกรรมที่ลงทะเบียนไว้ —{" "}
          <Link
            href="/dashboard/activities"
            className="text-indigo-600 underline"
          >
            ดูกิจกรรมที่เปิดรับลงทะเบียน
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {participations.map((p) => {
            const checkIn = p.attendanceRecords.find(
              (record) => record.eventType === "CHECK_IN",
            );
            const checkOut = p.attendanceRecords.find(
              (record) => record.eventType === "CHECK_OUT",
            );
            return (
              <div
                key={String(p.id)}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    {p.activity.title}
                  </h2>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {formatThaiDateTime(p.activity.startsAt.toISOString())} →{" "}
                  {formatThaiDateTime(p.activity.endsAt.toISOString())}
                </p>
                {p.activity.location && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    สถานที่: {p.activity.location}
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="font-semibold text-slate-500 dark:text-slate-400">
                      เช็คอิน
                    </dt>
                    <dd className="text-slate-700 dark:text-slate-200">
                      {checkIn
                        ? formatThaiDateTime(checkIn.occurredAt.toISOString())
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500 dark:text-slate-400">
                      เช็คเอาท์
                    </dt>
                    <dd className="text-slate-700 dark:text-slate-200">
                      {checkOut
                        ? formatThaiDateTime(checkOut.occurredAt.toISOString())
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
