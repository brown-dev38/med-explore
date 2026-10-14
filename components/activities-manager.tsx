"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActivityListItem, ActivityStatus } from "@/types/activity";
import {
  formatThaiDateTime,
  localInputToIso,
} from "@/lib/datetime";

const STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: "ฉบับร่าง",
  PUBLISHED: "เปิดรับลงทะเบียน",
  COMPLETED: "สิ้นสุด",
  CANCELLED: "ยกเลิก",
};

const STATUS_STYLE: Record<ActivityStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-slate-200",
  PUBLISHED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  COMPLETED:
    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  CANCELLED:
    "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60";

const btnGhost =
  "inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800";

const emptyForm = {
  title: "",
  location: "",
  startsAt: "",
  endsAt: "",
  minMinutes: "90",
  description: "",
};

export function ActivitiesManager({
  initial,
  detailBasePath = "/organizer/activities",
}: {
  initial: ActivityListItem[];
  detailBasePath?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/activities");
    if (res.ok) {
      const json = await res.json();
      setItems(json.data);
    }
  }

  async function request(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        return false;
      }
      await reload();
      router.refresh();
      return true;
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim() || !form.startsAt || !form.endsAt) {
      setError("กรุณากรอกชื่อกิจกรรมและช่วงเวลาให้ครบถ้วน");
      return;
    }
    const ok = await request("/api/activities", "POST", {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      startsAt: localInputToIso(form.startsAt),
      endsAt: localInputToIso(form.endsAt),
      minMinutes: Number(form.minMinutes) || 90,
    });
    if (ok) setForm(emptyForm);
  }

  const changeStatus = (id: string, status: ActivityStatus) =>
    request(`/api/activities/${id}`, "PATCH", { status });

  const remove = (id: string) => request(`/api/activities/${id}`, "DELETE");

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

      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            ชื่อกิจกรรม
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="เช่น อบรมปฐมพยาบาลเบื้องต้น"
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            สถานที่
          </label>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="เช่น ห้องประชุม 1"
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            เวลาเริ่มต้น
          </label>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            เวลาสิ้นสุด
          </label>
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            จำนวนนาทีขั้นต่ำ
          </label>
          <input
            type="number"
            min={1}
            value={form.minMinutes}
            onChange={(e) => setForm({ ...form, minMinutes: e.target.value })}
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            รายละเอียด
          </label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full justify-center`}>
            สร้างกิจกรรม
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-neutral-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">กิจกรรม</th>
              <th className="px-4 py-3 font-semibold">ช่วงเวลา</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
              <th className="px-4 py-3 font-semibold">ผู้ลงทะเบียน</th>
              <th className="px-4 py-3 text-right font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  ยังไม่มีกิจกรรม
                </td>
              </tr>
            )}
            {items.map((activity) => (
              <tr key={activity.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`${detailBasePath}/${activity.id}`}
                    className="font-medium text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                  >
                    {activity.title}
                  </Link>
                  {activity.location && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {activity.location}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {formatThaiDateTime(activity.startsAt)}
                  <div className="text-xs text-slate-400">
                    ถึง {formatThaiDateTime(activity.endsAt)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[activity.status]}`}
                  >
                    {STATUS_LABEL[activity.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {activity.participantCount}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      href={`${detailBasePath}/${activity.id}`}
                      className={btnGhost}
                    >
                      รายละเอียด
                    </Link>
                    {activity.status === "DRAFT" && (
                      <>
                        <button
                          type="button"
                          onClick={() => changeStatus(activity.id, "PUBLISHED")}
                          disabled={busy}
                          className={btnGhost}
                        >
                          เปิดรับลงทะเบียน
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(activity.id)}
                          disabled={busy}
                          className="inline-flex items-center rounded-xl border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          ลบ
                        </button>
                      </>
                    )}
                    {activity.status === "PUBLISHED" && (
                      <>
                        <button
                          type="button"
                          onClick={() => changeStatus(activity.id, "COMPLETED")}
                          disabled={busy}
                          className={btnGhost}
                        >
                          สิ้นสุดกิจกรรม
                        </button>
                        <button
                          type="button"
                          onClick={() => changeStatus(activity.id, "CANCELLED")}
                          disabled={busy}
                          className={btnGhost}
                        >
                          ยกเลิก
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
