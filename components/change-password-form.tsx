"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const empty = { currentPassword: "", password: "", confirmPassword: "" };

export function ChangePasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const fieldId = useId();
  const [form, setForm] = useState(empty);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !hasPassword) return;
    setError(null); setSuccess(false);
    if (!form.currentPassword) { setError("กรุณาระบุรหัสผ่านปัจจุบัน"); return; }
    if (form.password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (new TextEncoder().encode(form.password).length > 72) { setError("รหัสผ่านยาวเกินไป"); return; }
    if (form.password !== form.confirmPassword) { setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน"); return; }
    if (form.password === form.currentPassword) { setError("รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน"); return; }
    inFlight.current = true; setSaving(true);
    try {
      const response = await fetch("/api/users/me/password", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ"); return; }
      setForm(empty); setShowPassword(false); setSuccess(true);
    } catch { setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่"); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />เปลี่ยนรหัสผ่านของฉัน</CardTitle>
      <CardDescription>ใช้รหัสผ่านปัจจุบันเพื่อเปลี่ยนรหัสผ่าน MedExplore Star การเปลี่ยนนี้ไม่มีผลต่อรหัสผ่าน Microsoft</CardDescription>
    </CardHeader>
    <CardContent>
      {!hasPassword ? <p className="text-sm text-muted-foreground">บัญชีนี้ยังไม่มีรหัสผ่านของระบบ กรุณาติดต่อผู้ดูแลระบบ</p> : <form onSubmit={submit} className="max-w-2xl space-y-4" aria-busy={saving}>
        {error && <Alert variant="destructive" role="alert"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งถัดไปให้เข้าสู่ระบบด้วยรหัสผ่านใหม่</p>}
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-current`}>รหัสผ่านปัจจุบัน</Label>
          <Input id={`${fieldId}-current`} name="currentPassword" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={1024} value={form.currentPassword} onChange={(event) => { setForm({ ...form, currentPassword: event.target.value }); setSuccess(false); }} disabled={saving} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {([{ name: "password", label: "รหัสผ่านใหม่" }, { name: "confirmPassword", label: "ยืนยันรหัสผ่านใหม่" }] as const).map((field) => <div key={field.name} className="space-y-2">
            <Label htmlFor={`${fieldId}-${field.name}`}>{field.label}</Label>
            <Input id={`${fieldId}-${field.name}`} name={field.name} type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} maxLength={72} value={form[field.name]} onChange={(event) => { setForm({ ...form, [field.name]: event.target.value }); setSuccess(false); }} disabled={saving} aria-describedby={`${fieldId}-hint`} />
          </div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร และต้องต่างจากรหัสผ่านปัจจุบัน</p>
          <Button type="button" variant="ghost" size="sm" disabled={saving} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}{showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}</Button>
        </div>
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</Button>
      </form>}
    </CardContent>
  </Card>;
}
