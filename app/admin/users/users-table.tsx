"use client";

import { useState } from "react";
import { ROLES } from "@/lib/permissions";
import type { UserDto, UserListResult } from "@/types/user";

const ROLE_OPTIONS = [ROLES.ADMIN, ROLES.ORGANIZER, ROLES.STUDENT];
const PAGE_SIZE = 10;

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60";

const btnGhost =
  "inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800";

type EditState = {
  firstname: string;
  lastname: string;
  studentCode: string;
  isActive: boolean;
  roles: string[];
};

export function UsersTable({ initialResult }: { initialResult: UserListResult }) {
  const [result, setResult] = useState(initialResult);
  const [formQ, setFormQ] = useState("");
  const [formRole, setFormRole] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<UserDto | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchUsers(nextPage: number, nextQ: string, nextRole: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      if (nextQ) params.set("q", nextQ);
      if (nextRole) params.set("role", nextRole);

      const res = await fetch(`/api/users?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "โหลดข้อมูลไม่สำเร็จ");
        return;
      }
      setResult(json.data);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextQ = formQ.trim();
    setAppliedQ(nextQ);
    setAppliedRole(formRole);
    void fetchUsers(1, nextQ, formRole);
  }

  function goToPage(nextPage: number) {
    void fetchUsers(nextPage, appliedQ, appliedRole);
  }

  function openEdit(user: UserDto) {
    setEditing(user);
    setEdit({
      firstname: user.firstname ?? "",
      lastname: user.lastname ?? "",
      studentCode: user.studentCode ?? "",
      isActive: user.isActive,
      roles: user.roles,
    });
  }

  function toggleRole(role: string) {
    if (!edit) return;
    setEdit({
      ...edit,
      roles: edit.roles.includes(role)
        ? edit.roles.filter((value) => value !== role)
        : [...edit.roles, role],
    });
  }

  async function save() {
    if (!editing || !edit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname: edit.firstname,
          lastname: edit.lastname,
          studentCode: edit.studentCode,
          isActive: edit.isActive,
          roles: edit.roles,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setEditing(null);
      setEdit(null);
      await fetchUsers(result.page, appliedQ, appliedRole);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            ค้นหา
          </label>
          <input
            value={formQ}
            onChange={(e) => setFormQ(e.target.value)}
            placeholder="ชื่อผู้ใช้, รหัสนิสิต, อีเมล หรือชื่อ-นามสกุล"
            className={inputClass}
          />
        </div>
        <div className="space-y-1 sm:w-44">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            บทบาท
          </label>
          <select
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
            className={inputClass}
          >
            <option value="">ทั้งหมด</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading} className={btnPrimary}>
          ค้นหา
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-neutral-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">ชื่อ-นามสกุล</th>
              <th className="px-4 py-3 font-semibold">บัญชี</th>
              <th className="px-4 py-3 font-semibold">บทบาท</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
              <th className="px-4 py-3 text-right font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {result.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  ไม่พบผู้ใช้งาน
                </td>
              </tr>
            )}
            {result.items.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {[user.firstname, user.lastname].filter(Boolean).join(" ") ||
                      "-"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {user.studentCode
                      ? `รหัส ${user.studentCode}`
                      : "ไม่มีรหัสนิสิต"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-700 dark:text-slate-200">
                    {user.username}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 && (
                      <span className="text-xs text-slate-400">ไม่มีบทบาท</span>
                    )}
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      user.isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    }`}
                  >
                    {user.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    className={btnGhost}
                  >
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            หน้า {result.page} จาก {result.totalPages} ({result.total} รายการ)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnGhost}
              disabled={result.page <= 1 || loading}
              onClick={() => goToPage(result.page - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={result.page >= result.totalPages || loading}
              onClick={() => goToPage(result.page + 1)}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {editing && edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                แก้ไขผู้ใช้งาน
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editing.username} · {editing.email}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  ชื่อจริง
                </label>
                <input
                  value={edit.firstname}
                  onChange={(e) => setEdit({ ...edit, firstname: e.target.value })}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  นามสกุล
                </label>
                <input
                  value={edit.lastname}
                  onChange={(e) => setEdit({ ...edit, lastname: e.target.value })}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                รหัสนิสิต
              </label>
              <input
                value={edit.studentCode}
                onChange={(e) => setEdit({ ...edit, studentCode: e.target.value })}
                className={inputClass}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                บทบาท
              </span>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={edit.roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      disabled={saving}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={edit.isActive}
                onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
                disabled={saving}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              เปิดใช้งานบัญชี
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setEdit(null);
                }}
                disabled={saving}
                className={btnGhost}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className={btnPrimary}
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
