"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActivityListItem } from "@/types/activity";
import { formatThaiDateTime } from "@/lib/datetime";

const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60";

const btnGhost =
  "inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800";

export function ActivitiesBrowser({
  initial,
}: {
  initial: ActivityListItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/activities");
    if (res.ok) {
      const json = await res.json();
      setItems(json.data);
    }
  }

  async function unregister(participationId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/participations/${participationId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "ยกเลิกการลงทะเบียนไม่สำเร็จ");
        return;
      }
      await reload();
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          กิจกรรมที่เปิดรับลงทะเบียน
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          สแกน QR ที่ผู้จัดแสดง เพื่อเช็คอิน/เช็คเอาท์
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.length === 0 && (
          <p className="text-sm text-slate-500">
            ยังไม่มีกิจกรรมที่เปิดรับลงทะเบียน
          </p>
        )}
        {items.map((activity) => {
          const mine = activity.myParticipation;
          const checkedIn = Boolean(mine?.checkInAt);
          const checkedOut = Boolean(mine?.checkOutAt);
          return (
            <div
              key={activity.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {activity.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {formatThaiDateTime(activity.startsAt)} →{" "}
                {formatThaiDateTime(activity.endsAt)}
              </p>
              {activity.location && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  สถานที่: {activity.location}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                ผู้ลงทะเบียน {activity.participantCount} คน · เวลาขั้นต่ำ{" "}
                {activity.minMinutes} นาที
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {mine ? (
                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    ลงทะเบียนแล้ว
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-neutral-800 dark:text-slate-300">
                    ยังไม่ลงทะเบียน
                  </span>
                )}
                {mine?.checkInAt && (
                  <span className="text-slate-500 dark:text-slate-400">
                    เช็คอิน {formatThaiDateTime(mine.checkInAt)}
                  </span>
                )}
                {mine?.checkOutAt && (
                  <span className="text-slate-500 dark:text-slate-400">
                    เช็คเอาท์ {formatThaiDateTime(mine.checkOutAt)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!checkedOut ? (
                  <Link href="/scan" className={btnPrimary}>
                    {checkedIn ? "สแกน QR Check-out" : "สแกน QR Check-in"}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-xl bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    บันทึกเวลาครบแล้ว
                  </span>
                )}
                {mine && !checkedIn && (
                  <button
                    type="button"
                    onClick={() => unregister(mine.id)}
                    disabled={busy}
                    className={btnGhost}
                  >
                    ยกเลิกการลงทะเบียน
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
