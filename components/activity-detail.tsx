"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActivityDto,
  ActivityStatus,
  AttendanceEvent,
  ParticipationDto,
  QrPurpose,
  QrSessionDto,
} from "@/types/activity";
import { formatThaiDateTime, localInputToIso, toLocalInputValue } from "@/lib/datetime";

const STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: "ฉบับร่าง",
  PUBLISHED: "เปิดรับลงทะเบียน",
  COMPLETED: "สิ้นสุด",
  CANCELLED: "ยกเลิก",
};

type Candidate = {
  id: string;
  name: string;
  studentCode: string | null;
  email: string;
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100";

const btnPrimary =
  "inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60";

const btnGhost =
  "inline-flex items-center rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800";

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ActivityDetail({
  activity,
  participants,
}: {
  activity: ActivityDto;
  participants: ParticipationDto[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const [rows, setRows] = useState(participants);
  const [purpose, setPurpose] = useState<QrPurpose>("CHECK_IN");
  const [ttl, setTtl] = useState("15");
  const [qr, setQr] = useState<QrSessionDto | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [bulkIn, setBulkIn] = useState("");
  const [bulkOut, setBulkOut] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editingTime, setEditingTime] = useState<{
    participationId: string;
    userName: string;
    eventType: AttendanceEvent;
    value: string;
  } | null>(null);
  const [savingTime, setSavingTime] = useState(false);

  useEffect(() => {
    if (!qr) return;

    const target = new Date(qr.expiresAt).getTime();
    const id = setInterval(() => {
      const seconds = Math.max(0, Math.round((target - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds <= 0) {
        setQr(null);
        setNotice("QR หมดอายุแล้ว กรุณาสร้างใหม่");
      }
    }, 1000);

    return () => clearInterval(id);
  }, [qr]);

  async function reloadParticipants() {
    const res = await fetch(`/api/activities/${activity.id}/participations`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data);
    }
  }

  async function changeStatus(next: ActivityStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      setStatus(next);
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  async function generateQr() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/qr-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          purpose,
          ttlMinutes: Number(ttl) || 15,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "สร้าง QR ไม่สำเร็จ");
        return;
      }
      setQr(json.data);
      setRemaining(
        Math.max(
          0,
          Math.round(
            (new Date(json.data.expiresAt).getTime() - Date.now()) / 1000,
          ),
        ),
      );
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  async function closeQr() {
    if (!qr) return;
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/qr-sessions/${qr.id}`, { method: "DELETE" });
      setQr(null);
      setNotice("ปิด QR แล้ว");
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  async function loadCandidates(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const q = candidateQuery.trim();
      const res = await fetch(
        `/api/activities/${activity.id}/participants/candidates${
          q ? `?q=${encodeURIComponent(q)}` : ""
        }`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "ค้นหาไม่สำเร็จ");
        return;
      }
      setCandidates(json.data);
      setSelected([]);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setSearching(false);
    }
  }

  function onSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelected(
      Array.from(e.target.selectedOptions).map((option) => option.value),
    );
  }

  function selectAll() {
    setSelected(candidates.map((candidate) => candidate.id));
  }

  function toggleTools() {
    const next = !showTools;
    setShowTools(next);
    if (next && candidates.length === 0) void loadCandidates();
  }

  async function addSelected() {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/activities/${activity.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "เพิ่มผู้ลงทะเบียนไม่สำเร็จ");
        return;
      }
      setNotice(`เพิ่มผู้ลงทะเบียน ${json.data.added} คน`);
      setSelected([]);
      await loadCandidates();
      await reloadParticipants();
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  async function saveBulkTimes() {
    setBulkSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/activities/${activity.id}/attendance/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(bulkIn ? { checkInAt: localInputToIso(bulkIn) } : {}),
            ...(bulkOut ? { checkOutAt: localInputToIso(bulkOut) } : {}),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "บันทึกเวลาไม่สำเร็จ");
        return;
      }
      setNotice(`บันทึกเวลาให้ผู้ลงทะเบียน ${json.data.updated} คน`);
      await reloadParticipants();
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBulkSaving(false);
    }
  }

  function openTimeEditor(participation: ParticipationDto, eventType: AttendanceEvent) {
    const existing = participation.attendance.find(
      (record) => record.eventType === eventType,
    );
    setEditingTime({
      participationId: participation.id,
      userName: participation.userName,
      eventType,
      value: toLocalInputValue(
        existing ? existing.occurredAt : new Date().toISOString(),
      ),
    });
  }

  async function saveTime() {
    if (!editingTime) return;
    setSavingTime(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/attendance/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participationId: editingTime.participationId,
          eventType: editingTime.eventType,
          occurredAt: localInputToIso(editingTime.value),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "บันทึกเวลาไม่สำเร็จ");
        return;
      }
      setNotice(`บันทึกเวลาให้ ${editingTime.userName} เรียบร้อย`);
      setEditingTime(null);
      await reloadParticipants();
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setSavingTime(false);
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
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {activity.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {formatThaiDateTime(activity.startsAt)} →{" "}
              {formatThaiDateTime(activity.endsAt)}
            </p>
            {activity.location && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                สถานที่: {activity.location}
              </p>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              เวลาขั้นต่ำ: {activity.minMinutes} นาที · สถานะ:{" "}
              {STATUS_LABEL[status]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status === "DRAFT" && (
              <button
                type="button"
                onClick={() => changeStatus("PUBLISHED")}
                disabled={busy}
                className={btnPrimary}
              >
                เปิดรับลงทะเบียน
              </button>
            )}
            {status === "PUBLISHED" && (
              <>
                <button
                  type="button"
                  onClick={() => changeStatus("COMPLETED")}
                  disabled={busy}
                  className={btnGhost}
                >
                  สิ้นสุดกิจกรรม
                </button>
                <button
                  type="button"
                  onClick={() => changeStatus("CANCELLED")}
                  disabled={busy}
                  className={btnGhost}
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
        </div>
        {activity.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
            {activity.description}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          QR Check-in / Check-out
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          สร้างรหัส QR แล้วให้นิสิตสแกนเพื่อบันทึกเวลา (รหัสมีอายุตามที่กำหนด)
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              ประเภท
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as QrPurpose)}
              disabled={busy}
              className={inputClass}
            >
              <option value="CHECK_IN">เช็คอิน (Check-in)</option>
              <option value="CHECK_OUT">เช็คเอาท์ (Check-out)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              อายุ (นาที)
            </label>
            <input
              type="number"
              min={1}
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              disabled={busy}
              className={`${inputClass} w-28`}
            />
          </div>
          <button
            type="button"
            onClick={generateQr}
            disabled={busy}
            className={btnPrimary}
          >
            สร้าง QR
          </button>
        </div>

        {qr && (
          <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.qrDataUrl}
              alt="QR Code"
              width={220}
              height={220}
              className="rounded-xl border border-slate-200 bg-white p-2 dark:border-neutral-700"
            />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">
                {qr.purpose === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"} · หมดอายุ{" "}
                {formatThaiDateTime(qr.expiresAt)}
              </p>
              <p
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-lg font-bold ${
                  remaining <= 10
                    ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300"
                    : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {formatRemaining(remaining)}
              </p>
              <p className="break-all text-slate-600 dark:text-slate-400">
                ลิงก์:{" "}
                <a href={qr.scanUrl} className="text-indigo-600 underline">
                  {qr.scanUrl}
                </a>
              </p>
              <p className="break-all text-xs text-slate-400">
                โทเคน: {qr.token}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ทดสอบบนคอมพิวเตอร์: เปิดลิงก์ด้านบนในเบราว์เซอร์/หน้าต่างที่ล็อกอินเป็นนิสิต
                (หรือคัดลอกรหัสไปวางในหน้า &ldquo;สแกน QR&rdquo;)
              </p>
              <button
                type="button"
                onClick={closeQr}
                disabled={busy}
                className={btnGhost}
              >
                ปิด QR ตอนนี้
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            ผู้ลงทะเบียน ({rows.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleTools}
              disabled={busy}
              className={btnGhost}
            >
              {showTools ? "ปิดเครื่องมือ" : "จัดการผู้เข้าร่วม/เวลา"}
            </button>
            <button
              type="button"
              onClick={reloadParticipants}
              disabled={busy}
              className={btnGhost}
            >
              รีเฟรช
            </button>
          </div>
        </div>

        {showTools && (
          <div className="space-y-5 border-t border-slate-100 px-4 py-4 dark:border-neutral-800">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                เพิ่มผู้เข้าร่วม
              </h3>
              <form
                onSubmit={(e) => {
                  void loadCandidates(e);
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  placeholder="ค้นหา (เว้นว่างแล้วกดค้นหา เพื่อแสดงทั้งหมด)"
                  className={`${inputClass} flex-1`}
                />
                <button type="submit" disabled={searching} className={btnGhost}>
                  ค้นหา
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={selectAll} className={btnGhost}>
                  เลือกทั้งหมด ({candidates.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className={btnGhost}
                >
                  ล้างที่เลือก
                </button>
                <button
                  type="button"
                  onClick={addSelected}
                  disabled={busy || selected.length === 0}
                  className={btnPrimary}
                >
                  เพิ่มที่เลือก ({selected.length})
                </button>
              </div>
              <select
                multiple
                value={selected}
                onChange={onSelectChange}
                className="h-48 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {candidate.studentCode ? ` (${candidate.studentCode})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">
                กด Ctrl/Shift เพื่อเลือกหลายรายชื่อ · แสดงสูงสุด 200 คน
              </p>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                ตั้งค่าเวลาให้ผู้ลงทะเบียนทั้งหมด ({rows.length} คน)
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    เวลาเช็คอิน
                  </label>
                  <input
                    type="datetime-local"
                    value={bulkIn}
                    onChange={(e) => setBulkIn(e.target.value)}
                    className={inputClass}
                    disabled={bulkSaving}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    เวลาเช็คเอาท์
                  </label>
                  <input
                    type="datetime-local"
                    value={bulkOut}
                    onChange={(e) => setBulkOut(e.target.value)}
                    className={inputClass}
                    disabled={bulkSaving}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                เว้นว่างช่องที่ไม่ต้องการตั้ง · เช็คเอาท์จะตั้งให้เฉพาะคนที่มี
                เช็คอินแล้วเท่านั้น
              </p>
              <button
                type="button"
                onClick={saveBulkTimes}
                disabled={bulkSaving || (!bulkIn && !bulkOut)}
                className={btnPrimary}
              >
                {bulkSaving ? "กำลังบันทึก..." : "บันทึกเวลาให้ทุกคน"}
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-neutral-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">ชื่อ-นามสกุล</th>
              <th className="px-4 py-3 font-semibold">รหัสนิสิต</th>
              <th className="px-4 py-3 font-semibold">เช็คอิน</th>
              <th className="px-4 py-3 font-semibold">เช็คเอาท์</th>
              <th className="px-4 py-3 text-right font-semibold">จัดการเวลา</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  ยังไม่มีผู้ลงทะเบียน
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const checkIn = row.attendance.find(
                (record) => record.eventType === "CHECK_IN",
              );
              const checkOut = row.attendance.find(
                (record) => record.eventType === "CHECK_OUT",
              );
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {row.userName}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.studentCode ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {checkIn ? formatThaiDateTime(checkIn.occurredAt) : "—"}
                    {checkIn && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({checkIn.method === "QR" ? "QR" : "ผู้จัด"})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {checkOut ? formatThaiDateTime(checkOut.occurredAt) : "—"}
                    {checkOut && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({checkOut.method === "QR" ? "QR" : "ผู้จัด"})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openTimeEditor(row, "CHECK_IN")}
                        disabled={busy}
                        className={btnGhost}
                      >
                        {checkIn ? "แก้ไขเช็คอิน" : "บันทึกเช็คอิน"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openTimeEditor(row, "CHECK_OUT")}
                        disabled={busy}
                        className={btnGhost}
                      >
                        {checkOut ? "แก้ไขเช็คเอาท์" : "บันทึกเช็คเอาท์"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingTime.eventType === "CHECK_IN"
                  ? "บันทึกเวลาเช็คอิน"
                  : "บันทึกเวลาเช็คเอาท์"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editingTime.userName}
              </p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                วันเวลา
              </label>
              <input
                type="datetime-local"
                value={editingTime.value}
                onChange={(e) =>
                  setEditingTime({ ...editingTime, value: e.target.value })
                }
                className={inputClass}
                disabled={savingTime}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTime(null)}
                disabled={savingTime}
                className={btnGhost}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveTime}
                disabled={savingTime}
                className={btnPrimary}
              >
                {savingTime ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
