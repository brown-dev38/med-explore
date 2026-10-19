"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fields = [
  { name: "firstname", label: "ชื่อจริง", autoComplete: "given-name", required: false },
  { name: "lastname", label: "นามสกุล", autoComplete: "family-name", required: false },
  { name: "studentCode", label: "รหัสนิสิต", autoComplete: "off", required: true },
  { name: "username", label: "ชื่อผู้ใช้", autoComplete: "username", required: true },
  { name: "email", label: "อีเมล", autoComplete: "email", required: true },
  { name: "password", label: "รหัสผ่าน", autoComplete: "new-password", required: true },
  { name: "confirmPassword", label: "ยืนยันรหัสผ่าน", autoComplete: "new-password", required: true },
] as const;

export default function RegisterForm() {
  const [form, setForm] = useState({ studentCode: "", firstname: "", lastname: "", username: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || success) return;
    setError(null);
    if (!form.studentCode.trim()) {
      setError("กรุณาระบุรหัสนิสิต");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username.trim(), email: form.email.trim(), password: form.password, studentCode: form.studentCode.trim(), firstname: form.firstname.trim() || null, lastname: form.lastname.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setSuccess(true);
      toast.success("สร้างบัญชีผู้ใช้เรียบร้อยแล้ว");
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  if (success) return (
    <div className="space-y-5">
      <Alert className="border-primary/20 bg-primary/5"><CheckCircle2 className="text-primary" /><AlertTitle>สมัครสมาชิกสำเร็จ</AlertTitle><AlertDescription>บัญชีของคุณพร้อมใช้งานแล้ว เข้าสู่ระบบเพื่อเริ่มลงทะเบียนกิจกรรม</AlertDescription></Alert>
      <Button className="w-full" nativeButton={false} render={<Link href="/login" />}>ไปเข้าสู่ระบบ</Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      <p id="registration-hint" className="text-sm text-muted-foreground">สำหรับนิสิตเท่านั้น กรุณาระบุรหัสนิสิต ผู้จัดกิจกรรมและพนักงานให้ติดต่อ ADMIN เพื่อเพิ่มบัญชีผู้ใช้</p>
      {error && <Alert variant="destructive" id="register-error"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const password = field.name === "password" || field.name === "confirmPassword";
          return (
            <div key={field.name} className={field.name === "email" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <Label htmlFor={field.name}>{field.label}{!field.required && <span className="text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span>}</Label>
              <Input id={field.name} name={field.name} type={password ? (showPassword ? "text" : "password") : field.name === "email" ? "email" : "text"} autoComplete={field.autoComplete} value={form[field.name]} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} required={field.required} disabled={loading} minLength={password ? 6 : undefined} maxLength={field.name === "studentCode" ? 50 : undefined} aria-describedby={password ? "password-hint" : field.name === "studentCode" ? "registration-hint" : undefined} />
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p id="password-hint">รหัสผ่านอย่างน้อย 6 ตัวอักษร</p>
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="size-4 accent-primary" />แสดงรหัสผ่าน</label>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <UserPlus />}{loading ? "กำลังสร้างบัญชี..." : "สร้างบัญชีผู้ใช้"}</Button>
      <p className="border-t pt-5 text-center text-sm text-muted-foreground">มีบัญชีแล้ว? <Link href="/login" className="font-semibold text-primary hover:underline">เข้าสู่ระบบ</Link></p>
    </form>
  );
}
