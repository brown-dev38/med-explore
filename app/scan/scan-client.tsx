"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QrScanner } from "@/components/qr-scanner";

type ScanState = {
  status: "loading" | "ok" | "info" | "error" | "unregistered";
  message: string;
  activityId?: string;
  activityTitle?: string;
  canRegister?: boolean;
};

type ScanResponse = {
  message?: string;
  code?: string;
  activity?: { id: string; title: string; status: string } | null;
  data?: { eventType?: string };
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-slate-100";

function extractToken(raw: string): string {
  const match = raw.match(/[?&]token=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]) : raw.trim();
}

function scanStateFrom(res: Response, json: ScanResponse): ScanState {
  if (res.ok) {
    const eventType = json.data?.eventType;
    return {
      status: "ok",
      message: `บันทึก${eventType === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"}สำเร็จ`,
    };
  }
  if (res.status === 409) {
    return {
      status: "info",
      message: json.message ?? "มีการบันทึกเวลานี้ไปแล้ว",
    };
  }
  if (json.code === "NOT_REGISTERED") {
    return {
      status: "unregistered",
      message: json.message ?? "คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้",
      activityId: json.activity?.id,
      activityTitle: json.activity?.title,
      canRegister: json.activity?.status === "PUBLISHED",
    };
  }
  return {
    status: "error",
    message: json.message ?? "บันทึกเวลาไม่สำเร็จ",
  };
}

export function ScanClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [manualToken, setManualToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [state, setState] = useState<ScanState>({
    status: "loading",
    message: "กำลังบันทึกเวลา...",
  });

  useEffect(() => {
    if (!token) return;

    let active = true;
    (async () => {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      setState(scanStateFrom(res, json));
    })().catch(() => {
      if (active) {
        setState({
          status: "error",
          message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
        });
      }
    });

    return () => {
      active = false;
    };
  }, [token]);

  const goToToken = useCallback(
    (raw: string) => {
      const value = extractToken(raw);
      if (!value) return;
      router.replace(`/scan?token=${encodeURIComponent(value)}`);
    },
    [router],
  );

  function submitManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    goToToken(manualToken);
  }

  async function registerAndCheckIn() {
    const activityId = state.activityId;
    if (!activityId) return;

    setState({ status: "loading", message: "กำลังลงทะเบียนกิจกรรม..." });
    try {
      const reg = await fetch(
        `/api/activities/${activityId}/participations`,
        { method: "POST" },
      );
      if (!reg.ok && reg.status !== 409) {
        const errorBody = await reg.json().catch(() => ({}));
        setState({
          status: "error",
          message: errorBody.message ?? "ลงทะเบียนไม่สำเร็จ",
        });
        return;
      }

      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      setState(scanStateFrom(res, json));
    } catch {
      setState({
        status: "error",
        message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
      });
    }
  }

  const tone =
    state.status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
      : state.status === "error"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        บันทึกการเข้างาน
      </h1>

      {!token ? (
        <div className="mt-4 space-y-4 text-left">
          {scanning ? (
            <QrScanner onDetected={goToToken} onCancel={() => setScanning(false)} />
          ) : (
            <>
              <div className={`rounded-xl border p-4 text-sm font-medium ${tone}`}>
                สแกน QR จากหน้าจอผู้จัดเพื่อบันทึกเวลา
              </div>
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500"
              >
                เปิดกล้องสแกน
              </button>
              <p className="text-center text-xs text-slate-400">
                ต้องเปิดหน้าเว็บผ่าน HTTPS หรือ localhost
              </p>
              <div className="text-center text-xs text-slate-400">หรือ</div>
              <form onSubmit={submitManual} className="space-y-2">
                <input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="วางรหัส QR หรือลิงก์"
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800"
                >
                  บันทึกเวลาด้วยรหัส
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <>
          {state.status === "loading" && (
            <p className="mt-4 text-sm text-slate-500">{state.message}</p>
          )}

          {(state.status === "ok" ||
            state.status === "info" ||
            state.status === "error") && (
            <div
              className={`mt-4 rounded-xl border p-4 text-sm font-medium ${tone}`}
            >
              {state.message}
            </div>
          )}

          {state.status === "unregistered" && (
            <div className="mt-4 space-y-3 text-left">
              <div
                className={`rounded-xl border p-4 text-sm font-medium ${tone}`}
              >
                {state.message}
              </div>
              {state.activityTitle && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  กิจกรรม:{" "}
                  <span className="font-medium text-slate-900 dark:text-white">
                    {state.activityTitle}
                  </span>
                </p>
              )}
              {state.canRegister ? (
                <button
                  type="button"
                  onClick={registerAndCheckIn}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:from-indigo-500 hover:to-sky-500"
                >
                  ลงทะเบียนกิจกรรมนี้แล้วเช็คอิน
                </button>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน กรุณาติดต่อผู้จัด
                </p>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/dashboard/activities"
          className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800"
        >
          กลับไปหน้ากิจกรรม
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white hover:from-indigo-500 hover:to-sky-500 transition-all"
        >
          แดชบอร์ด
        </Link>
      </div>
    </div>
  );
}
