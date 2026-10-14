"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AcademicYearDto, AcademicYearStatus } from "@/types/academic-year";

const STATUS_LABEL: Record<AcademicYearStatus, string> = {
  DRAFT: "ฉบับร่าง",
  ACTIVE: "ใช้งานอยู่",
  CLOSED: "ปิดแล้ว",
};

const STATUS_STYLE: Record<AcademicYearStatus, string> = {
  DRAFT:
    "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-slate-200",
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  CLOSED: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60";

const btnGhost =
  "inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800";

export function AcademicYearManager({
  initialYears,
}: {
  initialYears: AcademicYearDto[];
}) {
  const router = useRouter();
  const [years, setYears] = useState(initialYears);
  const [form, setForm] = useState({ code: "", startsOn: "", endsOn: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: "", startsOn: "", endsOn: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/academic-years");
    if (res.ok) {
      const json = await res.json();
      setYears(json.data);
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
    if (!form.code.trim() || !form.startsOn || !form.endsOn) {
      setError("กรุณากรอกรหัสและช่วงวันที่ให้ครบถ้วน");
      return;
    }
    const ok = await request("/api/academic-years", "POST", form);
    if (ok) setForm({ code: "", startsOn: "", endsOn: "" });
  }

  function startEdit(year: AcademicYearDto) {
    setError(null);
    setEditingId(year.id);
    setEditForm({
      code: year.code,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
    });
  }

  async function saveEdit(id: string) {
    const ok = await request(`/api/academic-years/${id}`, "PATCH", editForm);
    if (ok) setEditingId(null);
  }

  const changeStatus = (id: string, status: AcademicYearStatus) =>
    request(`/api/academic-years/${id}`, "PATCH", { status });

  const remove = (id: string) =>
    request(`/api/academic-years/${id}`, "DELETE");

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
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            รหัสปีการศึกษา
          </label>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="เช่น 2569"
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            วันเริ่มต้น
          </label>
          <input
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            วันสิ้นสุด
          </label>
          <input
            type="date"
            value={form.endsOn}
            onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            disabled={busy}
            className={inputClass}
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full justify-center`}>
            เพิ่มปีการศึกษา
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-neutral-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">รหัส</th>
              <th className="px-4 py-3 font-semibold">ช่วงวันที่</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
              <th className="px-4 py-3 text-right font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {years.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  ยังไม่มีข้อมูลปีการศึกษา
                </td>
              </tr>
            )}
            {years.map((year) => {
              const isEditing = editingId === year.id;
              return (
                <tr key={year.id} className="align-middle">
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        value={editForm.code}
                        onChange={(e) =>
                          setEditForm({ ...editForm, code: e.target.value })
                        }
                        className={inputClass}
                        disabled={busy}
                      />
                    ) : (
                      <span className="font-medium text-slate-900 dark:text-white">
                        {year.code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={editForm.startsOn}
                          onChange={(e) =>
                            setEditForm({ ...editForm, startsOn: e.target.value })
                          }
                          className={inputClass}
                          disabled={busy}
                        />
                        <input
                          type="date"
                          value={editForm.endsOn}
                          onChange={(e) =>
                            setEditForm({ ...editForm, endsOn: e.target.value })
                          }
                          className={inputClass}
                          disabled={busy}
                        />
                      </div>
                    ) : (
                      `${year.startsOn} → ${year.endsOn}`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[year.status]}`}
                    >
                      {STATUS_LABEL[year.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEdit(year.id)}
                            disabled={busy}
                            className={btnGhost}
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                            className={btnGhost}
                          >
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          {year.status === "DRAFT" && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(year)}
                                disabled={busy}
                                className={btnGhost}
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => changeStatus(year.id, "ACTIVE")}
                                disabled={busy}
                                className={btnGhost}
                              >
                                เปิดใช้งาน
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(year.id)}
                                disabled={busy}
                                className="inline-flex items-center rounded-xl border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                ลบ
                              </button>
                            </>
                          )}
                          {year.status === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => changeStatus(year.id, "CLOSED")}
                              disabled={busy}
                              className={btnGhost}
                            >
                              ปิดปีการศึกษา
                            </button>
                          )}
                          {year.status === "CLOSED" && (
                            <button
                              type="button"
                              onClick={() => changeStatus(year.id, "DRAFT")}
                              disabled={busy}
                              className={btnGhost}
                            >
                              เปิดใหม่
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
