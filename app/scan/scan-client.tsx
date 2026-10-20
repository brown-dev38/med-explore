"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  QrCode,
  Loader2,
} from "lucide-react";
import { QrScanner } from "@/components/qr-scanner";
import { notifyActivityUpdate } from "@/lib/activity-live";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ScanState = {
  status: "loading" | "ok" | "info" | "error" | "unregistered" | "ready_checkout";
  message: string;
  activityId?: string;
  canRegister?: boolean;
  token?: string;
};

type ScanResponse = {
  message?: string;
  code?: string;
  activity?: { id: string; title: string; status: string } | null;
  data?: { purpose?: "CHECK_IN" | "CHECK_OUT"; eventType?: string; evaluation?: { attendedMinutes: number | null; yellowStarPoints: number; message: string } };
};

function extractToken(raw: string): string {
  const match = raw.match(/[?&]token=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]) : raw.trim();
}

function scanStateFrom(res: Response, json: ScanResponse, purpose?: "CHECK_OUT"): ScanState {
  if (res.ok) {
    const eventType = json.data?.eventType;
    const evaluation = json.data?.evaluation;
    return {
      status: "ok",
      message: `บันทึก${eventType === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"}สำเร็จ${evaluation?.attendedMinutes !== null && evaluation?.attendedMinutes !== undefined ? ` · เข้าร่วม ${evaluation.attendedMinutes} นาที · ${evaluation.message}` : ""}`,
    };
  }
  if (res.status === 409) {
    return {
      status: "info",
      message: json.message ?? "มีการบันทึกเวลานี้ไปแล้ว",
    };
  }
  if (json.code === "NOT_REGISTERED") {
    if (purpose === "CHECK_OUT") {
      return { status: "error", message: "ยังไม่พบการเช็คอิน ไม่สามารถเช็คเอาท์ได้" };
    }
    return {
      status: "unregistered",
      message: json.message ?? "คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้",
      activityId: json.activity?.id,
      canRegister: json.activity?.status === "PUBLISHED",
    };
  }
  return {
    status: "error",
    message: json.message ?? "บันทึกเวลาไม่สำเร็จ",
  };
}

export function ScanClient({ academicYearId, academicYearCode }: { academicYearId: string; academicYearCode: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const yearQuery = `academicYearId=${encodeURIComponent(academicYearId)}`;
  const [manualToken, setManualToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const checkoutRequest = useRef<AbortController | null>(null);
  const [state, setState] = useState<ScanState>({
    status: "loading",
    message: "กำลังตรวจสอบ QR Code...",
  });

  useEffect(() => {
    if (!token) return;

    let active = true;
    const controller = new AbortController();
    (async () => {
      const preview = await fetch(`/api/attendance/scan?token=${encodeURIComponent(token)}&academicYearId=${encodeURIComponent(academicYearId)}`, {
        cache: "no-store", signal: controller.signal,
      });
      const previewJson: ScanResponse = await preview.json().catch(() => ({}));
      if (!active) return;
      if (!preview.ok) {
        setState({ status: "error", message: previewJson.message ?? "ตรวจสอบ QR Code ไม่สำเร็จ" });
        return;
      }
      if (previewJson.data?.purpose === "CHECK_OUT") {
        setState({ status: "ready_checkout", message: "", token });
        return;
      }
      if (previewJson.data?.purpose !== "CHECK_IN") {
        setState({ status: "error", message: "ประเภท QR Code ไม่ถูกต้อง" });
        return;
      }
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, academicYearId }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      setState(scanStateFrom(res, json));
      if (res.ok || res.status === 409) notifyActivityUpdate();
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
      controller.abort();
      checkoutRequest.current?.abort();
      checkoutRequest.current = null;
    };
  }, [token, academicYearId]);

  const goToToken = useCallback(
    (raw: string) => {
      const value = extractToken(raw);
      if (!value) return;
      setState({ status: "loading", message: "กำลังตรวจสอบ QR Code..." });
      router.replace(`/scan?token=${encodeURIComponent(value)}&${yearQuery}`);
    },
    [router, yearQuery],
  );

  function submitManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    goToToken(manualToken);
  }

  async function confirmCheckOut() {
    if (state.status !== "ready_checkout" || state.token !== token || checkoutRequest.current) return;
    const controller = new AbortController();
    checkoutRequest.current = controller;
    setState({ status: "loading", message: "กำลังบันทึก Check-out..." });
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, academicYearId }), signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!controller.signal.aborted) {
        setState(scanStateFrom(res, json, "CHECK_OUT"));
        if (res.ok || res.status === 409) notifyActivityUpdate();
      }
    } catch {
      if (!controller.signal.aborted) setState({ status: "error", message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาสแกนอีกครั้ง" });
    } finally {
      if (checkoutRequest.current === controller) checkoutRequest.current = null;
    }
  }

  async function registerAndCheckIn() {
    const activityId = state.activityId;
    if (!activityId) return;

    setState({ status: "loading", message: "กำลังเช็คอิน..." });
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
      notifyActivityUpdate();

      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, academicYearId }),
      });
      const json = await res.json().catch(() => ({}));
      setState(scanStateFrom(res, json));
      if (res.ok || res.status === 409) notifyActivityUpdate();
    } catch {
      setState({
        status: "error",
        message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
      });
    }
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
          <QrCode className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          บันทึกการเข้างาน (QR Code)
        </CardTitle>
        <CardDescription className="text-xs">
          ปีการศึกษา {academicYearCode} · สแกน QR Code จากหน้าจอผู้จัดเพื่อบันทึกเวลา เช็คอิน / เช็คเอาท์
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {!token ? (
          <div className="space-y-4">
            {scanning ? (
              <QrScanner
                onDetected={goToToken}
                onCancel={() => setScanning(false)}
              />
            ) : (
              <>
                <Button
                  onClick={() => setScanning(true)}
                  className="w-full gap-2 py-5 text-base"
                >
                  <Camera className="h-5 w-5" />
                  เปิดกล้องสแกน QR Code
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  * หมายเหตุ: การใช้กล้องต้องเปิดผ่าน HTTPS หรือ localhost
                </p>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      หรือกรอกรหัสด้วยตนเอง
                    </span>
                  </div>
                </div>

                <form onSubmit={submitManual} className="space-y-2.5">
                  <Label htmlFor="manual-token">รหัสหรือลิงก์สำหรับสแกน</Label>
                  <Input
                    id="manual-token"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="วางรหัส Token หรือ URL ลิงก์ที่นี่..."
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={!manualToken.trim()}
                  >
                    บันทึกเวลาด้วยรหัส
                  </Button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {state.status === "ready_checkout" && state.token === token && (
              <Button type="button" onClick={confirmCheckOut} className="w-full gap-2 py-5">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />ยืนยัน Check-out
              </Button>
            )}
            {state.status === "loading" && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm font-medium text-foreground">
                  {state.message}
                </p>
              </div>
            )}

            {state.status === "ok" && (
              <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="font-semibold">สำเร็จ!</AlertTitle>
                <AlertDescription className="text-xs">
                  {state.message}
                </AlertDescription>
              </Alert>
            )}

            {state.status === "info" && (
              <Alert className="border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200">
                <Clock className="h-4 w-4 text-sky-600" />
                <AlertTitle className="font-semibold">ข้อมูลการเข้างาน</AlertTitle>
                <AlertDescription className="text-xs">
                  {state.message}
                </AlertDescription>
              </Alert>
            )}

            {state.status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold">ไม่สามารถบันทึกเวลาได้</AlertTitle>
                <AlertDescription className="text-xs">
                  {state.message}
                </AlertDescription>
              </Alert>
            )}

            {state.status === "unregistered" && (
              <div className="space-y-3">
                {state.canRegister ? (
                  <Button
                    onClick={registerAndCheckIn}
                    className="w-full gap-2 py-5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Check-in เข้างาน
                  </Button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    กิจกรรมนี้ยังไม่เปิดให้เช็คอิน กรุณาติดต่อผู้จัดงาน
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-center gap-2 border-t pt-4">
        {token && state.status !== "loading" && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/scan?${yearQuery}`} />}>สแกนอีกครั้ง</Button>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/dashboard/activities?${yearQuery}`}>หน้ารวมกิจกรรม</Link>}
        />
        <Button
          variant="default"
          size="sm"
          nativeButton={false}
          render={
            <Link href={`/dashboard?${yearQuery}`} className="gap-1">
              ไปที่แดชบอร์ด
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </CardFooter>
    </Card>
  );
}
