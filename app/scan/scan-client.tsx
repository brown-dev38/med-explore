"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles,
  QrCode,
  Loader2,
} from "lucide-react";
import { QrScanner } from "@/components/qr-scanner";
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
  data?: { eventType?: string; evaluation?: { attendedMinutes: number | null; yellowStarPoints: number; message: string } };
};

function extractToken(raw: string): string {
  const match = raw.match(/[?&]token=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]) : raw.trim();
}

function scanStateFrom(res: Response, json: ScanResponse): ScanState {
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
          สแกน QR Code จากหน้าจอผู้จัดเพื่อบันทึกเวลา เช็คอิน / เช็คเอาท์
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
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="font-semibold">ยังไม่ได้ลงทะเบียน</AlertTitle>
                  <AlertDescription className="text-xs">
                    {state.message}
                  </AlertDescription>
                </Alert>

                {state.activityTitle && (
                  <div className="rounded-lg border p-3 text-xs">
                    <p className="text-muted-foreground">กิจกรรม:</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">
                      {state.activityTitle}
                    </p>
                  </div>
                )}

                {state.canRegister ? (
                  <Button
                    onClick={registerAndCheckIn}
                    className="w-full gap-2 py-5"
                  >
                    <Sparkles className="h-4 w-4" />
                    ลงทะเบียนกิจกรรมนี้แล้วเช็คอินทันที
                  </Button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน กรุณาติดต่อผู้จัดงาน
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-center gap-2 border-t pt-4">
        {token && state.status !== "loading" && (
          <Button variant="outline" size="sm" render={<Link href="/scan" />}>สแกนอีกครั้ง</Button>
        )}
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/dashboard/activities">หน้ารวมกิจกรรม</Link>}
        />
        <Button
          variant="default"
          size="sm"
          render={
            <Link href="/dashboard" className="gap-1">
              ไปที่แดชบอร์ด
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </CardFooter>
    </Card>
  );
}
