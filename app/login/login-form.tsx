"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { dashboardPathFor } from "@/lib/permissions";
import { getMicrosoftSignInUrl, signInWithCredentials } from "@/lib/auth-client";
import { MicrosoftIcon } from "@/components/microsoft-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSessionNotice } from "@/lib/session-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuspendedAccountDialog } from "@/components/suspended-account-dialog";

const loginErrors: Record<string, string> = {
  CredentialsSignin: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  MicrosoftNotLinked: "บัญชี Microsoft นี้ยังไม่ได้ผูกกับระบบ กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิม แล้วผูก Microsoft ในหน้าโปรไฟล์",
  MicrosoftTenant: "กรุณาใช้บัญชี Microsoft ขององค์กรที่ระบบกำหนด",
  MicrosoftLinkExpired: "การผูกบัญชีหมดอายุ กรุณาเข้าสู่ระบบด้วยรหัสผ่านแล้วเริ่มใหม่ในหน้าโปรไฟล์",
  MicrosoftUnavailable: "ไม่สามารถเข้าสู่ระบบด้วย Microsoft ได้ กรุณาลองใหม่อีกครั้ง",
};

export default function LoginForm({ microsoftEnabled = false }: { microsoftEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const sessionNotice = getSessionNotice(searchParams.get("reason"));
  const suspended = searchParams.get("reason") === "account-suspended";
  const [acknowledgedSuspension, setAcknowledgedSuspension] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"credentials" | "microsoft" | null>(null);
  const loading = pending !== null;
  const setLoading = (value: boolean) => setPending(value ? "credentials" : null);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? loginErrors[searchParams.get("error")!] ?? "การเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" : null,
  );

  async function microsoftLogin() {
    if (loading || !microsoftEnabled) return;
    setPending("microsoft");
    setError(null);
    try { window.location.assign(await getMicrosoftSignInUrl(callbackUrl)); }
    catch (error) { setError(error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อ Microsoft ได้"); setPending(null); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { ok, session } = await signInWithCredentials(identifier.trim(), password, callbackUrl);
      if (!ok) {
        setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
        setLoading(false);
        return;
      }
      toast.success("เข้าสู่ระบบสำเร็จ");
      const localCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.includes("\\");
      router.push(localCallback && callbackUrl !== "/" ? callbackUrl : dashboardPathFor(session?.user ?? null));
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      <SuspendedAccountDialog open={suspended && !acknowledgedSuspension} onConfirm={() => setAcknowledgedSuspension(true)} />
      {sessionNotice && !suspended && <Alert variant="destructive" role="alert"><ShieldAlert /><AlertTitle>{sessionNotice.title}</AlertTitle><AlertDescription>{sessionNotice.message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive" id="login-error"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2">
        <Label htmlFor="identifier">ชื่อผู้ใช้ รหัสนิสิต หรืออีเมล</Label>
        <Input id="identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={loading} required placeholder="กรอกชื่อผู้ใช้ รหัสนิสิต หรืออีเมล" aria-describedby={error ? "login-error" : undefined} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required className="pr-12" placeholder="กรอกรหัสผ่าน" />
          <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0" onClick={() => setShowPassword(!showPassword)} disabled={loading} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={showPassword}>
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {pending === "credentials" ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {pending === "credentials" ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />หรือ<span className="h-px flex-1 bg-border" /></div>
        <Button type="button" variant="outline" className="w-full" disabled={loading || !microsoftEnabled} onClick={microsoftLogin} aria-describedby="microsoft-login-status">
          {pending === "microsoft" ? <Loader2 className="animate-spin" /> : <MicrosoftIcon />}
          {pending === "microsoft" ? "กำลังเชื่อมต่อ Microsoft..." : "เข้าสู่ระบบด้วย Microsoft"}
        </Button>
        <p id="microsoft-login-status" className="text-center text-xs text-muted-foreground">{microsoftEnabled ? "สำหรับบัญชีองค์กรที่ผูกไว้ในโปรไฟล์แล้ว" : "Microsoft ยังไม่เปิดให้บริการ กรุณาติดต่อผู้ดูแลระบบ"}</p>
      </div>
      <p className="border-t pt-5 text-center text-sm text-muted-foreground">ยังไม่มีบัญชี? <Link href="/register" className="font-semibold text-primary hover:underline">สมัครสมาชิก</Link></p>
    </form>
  );
}
