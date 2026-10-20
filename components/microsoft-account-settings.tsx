"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getMicrosoftSignInUrl } from "@/lib/auth-client";
import { MicrosoftIcon } from "@/components/microsoft-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = { enabled: boolean; account: { label: string | null; linkedAt: string } | null };
const notices: Record<string, string> = {
  linked: "ผูกบัญชี Microsoft สำเร็จ ครั้งถัดไปใช้ปุ่ม Microsoft ในหน้าเข้าสู่ระบบได้",
  expired: "การผูกบัญชีหมดอายุ กรุณายืนยันรหัสผ่านแล้วเริ่มใหม่",
  "in-use": "บัญชี Microsoft นี้ผูกกับผู้ใช้อื่นแล้ว กรุณาเลือกบัญชีของคุณ",
  "already-linked": "คุณผูกบัญชี Microsoft ไว้แล้ว หากต้องการเปลี่ยนบัญชี กรุณายกเลิกการผูกเดิมก่อน",
  unavailable: "ผูกบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

export function MicrosoftAccountSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const passwordId = useId();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/microsoft-link", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "โหลดข้อมูลบัญชี Microsoft ไม่สำเร็จ");
        if (!controller.signal.aborted) { setStatus(result.data); setError(null); }
      })
      .catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"); });
    return () => controller.abort();
  }, [reload]);

  async function change(unlink: boolean) {
    if (inFlight.current || !password) return false;
    inFlight.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/auth/microsoft-link", {
        method: unlink ? "DELETE" : "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "ดำเนินการไม่สำเร็จ");
      setPassword("");
      if (unlink) {
        setStatus((current) => current ? { ...current, account: null } : current);
        setMessage("ยกเลิกการผูก Microsoft แล้ว คุณยังเข้าสู่ระบบด้วยรหัสผ่านเดิมได้");
        router.replace(window.location.pathname);
        router.refresh();
      } else {
        window.location.assign(await getMicrosoftSignInUrl(result.data.callbackUrl, true));
        return true;
      }
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  const notice = notices[params.get("microsoft") ?? ""];
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><MicrosoftIcon />บัญชี Microsoft</CardTitle>
      <CardDescription>ผูกบัญชีองค์กรเพื่อใช้ Microsoft เข้าสู่ระบบ ข้อมูลกิจกรรมและสิทธิ์ของคุณจะอยู่ในบัญชีเดิม</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {(message || notice) && <p role="status" className="text-sm">{message || notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!status && (error ? <Button variant="outline" onClick={() => setReload((value) => value + 1)}>ลองโหลดใหม่</Button> : <p role="status" className="text-sm text-muted-foreground">กำลังโหลดบัญชี Microsoft...</p>)}
      {status && !status.enabled && <p className="text-sm text-muted-foreground">การเข้าสู่ระบบด้วย Microsoft ยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลระบบ</p>}
      {status?.enabled && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!status.account) void change(false); }} aria-busy={busy}>
        <p className="text-sm">{status.account ? <>ผูกบัญชีแล้ว: <span className="font-medium break-all">{status.account.label || "บัญชีองค์กร Microsoft"}</span></> : "ยังไม่ได้ผูกบัญชี กรุณาใช้บัญชี Microsoft ขององค์กรที่กำหนด"}</p>
        <div className="max-w-sm space-y-2">
          <Label htmlFor={passwordId}>ยืนยันรหัสผ่านปัจจุบันของระบบ</Label>
          <Input id={passwordId} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={1024} disabled={busy} />
        </div>
        {status.account ? <Button type="button" variant="outline" disabled={busy || !password} onClick={() => setConfirm(true)}>ยกเลิกการผูก Microsoft</Button> : <Button type="submit" disabled={busy || !password}>{busy ? <Loader2 className="animate-spin" /> : <MicrosoftIcon />}ผูกบัญชี Microsoft</Button>}
      </form>}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="ยกเลิกการผูกบัญชี Microsoft?" description="เซสชันที่เข้าสู่ระบบผ่าน Microsoft จะสิ้นสุดลง คุณยังเข้าสู่ระบบด้วยรหัสผ่านเดิมได้" confirmText="ยกเลิกการผูก" variant="destructive" loading={busy} onConfirm={() => change(true)} />
    </CardContent>
  </Card>;
}
