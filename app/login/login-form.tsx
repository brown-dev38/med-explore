"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { dashboardPathFor } from "@/lib/permissions";
import { signInWithCredentials } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getSessionNotice } from "@/lib/session-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuspendedAccountDialog } from "@/components/suspended-account-dialog";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const sessionNotice = getSessionNotice(searchParams.get("reason"));
  const suspended = searchParams.get("reason") === "account-suspended";
  const [acknowledgedSuspension, setAcknowledgedSuspension] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "CredentialsSignin" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : null,
  );

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
        {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>
      <p className="border-t pt-5 text-center text-sm text-muted-foreground">ยังไม่มีบัญชี? <Link href="/register" className="font-semibold text-primary hover:underline">สมัครสมาชิก</Link></p>
    </form>
  );
}
