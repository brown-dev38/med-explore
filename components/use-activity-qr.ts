"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyActivityUpdate } from "@/lib/activity-live";
import type { QrSessionDto } from "@/types/activity";

type QrState = { qr: QrSessionDto | null; remaining: number; restoring: boolean; error: string; notice: string };
const empty: QrState = { qr: null, remaining: 0, restoring: false, error: "", notice: "" };
const secondsLeft = (qr: QrSessionDto) => Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));

function savedQr(value: unknown, activityId: string): value is QrSessionDto {
  if (!value || typeof value !== "object") return false;
  const qr = value as Partial<QrSessionDto>;
  return typeof qr.id === "string" && /^[1-9]\d{0,18}$/.test(qr.id) && qr.activityId === activityId && qr.purpose === "CHECK_IN"
    && typeof qr.expiresAt === "string" && Number.isFinite(new Date(qr.expiresAt).getTime())
    && typeof qr.token === "string" && qr.token.length > 0 && qr.token.length <= 256
    && typeof qr.scanUrl === "string" && typeof qr.qrDataUrl === "string" && qr.qrDataUrl.startsWith("data:image/png;base64,");
}

export function useActivityQr(activityId: string) {
  const key = `medexplore:activity-qr:${activityId}`;
  const [state, setState] = useState<QrState>({ ...empty, restoring: true });
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);

  const setQr = useCallback((qr: QrSessionDto | null) => {
    revision.current++;
    try {
      if (qr) window.sessionStorage.setItem(key, JSON.stringify(qr));
      else window.sessionStorage.removeItem(key);
    } catch { /* The current QR remains usable when storage is unavailable. */ }
    setState({ ...empty, qr, remaining: qr ? secondsLeft(qr) : 0 });
  }, [key]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++revision.current;
    async function restore() {
      setState({ ...empty, restoring: true });
      let cached: unknown;
      try { cached = JSON.parse(window.sessionStorage.getItem(key) ?? "null"); }
      catch { cached = null; }
      if (!savedQr(cached, activityId) || secondsLeft(cached) === 0) {
        try { window.sessionStorage.removeItem(key); } catch { /* Optional browser storage. */ }
        setState({ ...empty, notice: cached ? "QR เดิมหมดอายุหรือไม่สามารถเรียกคืนได้ กรุณาสร้าง QR ใหม่" : "" });
        return;
      }
      try {
        const response = await fetch(`/api/qr-sessions/${cached.id}?activityId=${encodeURIComponent(activityId)}`, {
          cache: "no-store", signal: controller.signal, headers: { "X-QR-Token": cached.token },
        });
        const json = await response.json();
        if (controller.signal.aborted || revision.current !== current) return;
        if (!response.ok) throw new Error(json.message ?? "ตรวจสอบ QR เดิมไม่สำเร็จ");
        if (!json.data) {
          window.sessionStorage.removeItem(key);
          setState({ ...empty, notice: "QR เดิมหมดอายุหรือถูกปิดแล้ว กรุณาสร้าง QR ใหม่" });
          return;
        }
        const qr = { ...cached, ...json.data };
        if (!savedQr(qr, activityId) || qr.id !== cached.id || secondsLeft(qr) === 0) {
          window.sessionStorage.removeItem(key);
          setState({ ...empty, notice: "QR เดิมหมดอายุแล้ว กรุณาสร้าง QR ใหม่" });
          return;
        }
        setState({ ...empty, qr, remaining: secondsLeft(qr) });
      } catch (error) {
        if (!controller.signal.aborted && revision.current === current) {
          setState({ ...empty, error: error instanceof Error ? error.message : "ตรวจสอบ QR เดิมไม่สำเร็จ กรุณาลองอีกครั้ง" });
        }
      }
    }
    void restore();
    return () => controller.abort();
  }, [activityId, key, retry]);

  const qr = state.qr?.activityId === activityId ? state.qr : null;
  useEffect(() => {
    if (!qr) return;
    const timer = window.setInterval(() => {
      const remaining = secondsLeft(qr);
      if (!remaining) {
        window.clearInterval(timer);
        setQr(null);
        notifyActivityUpdate();
        setState({ ...empty, notice: "QR Code หมดอายุแล้ว กรุณาสร้าง QR ใหม่" });
      } else setState((current) => ({ ...current, remaining }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [qr, setQr]);

  return { ...state, qr, setQr, retryRestore: () => setRetry((value) => value + 1) };
}
