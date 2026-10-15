"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ROLES, type RoleName } from "@/lib/permissions";
import { UserRoleSelector } from "@/components/user-role-selector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EMPTY_FORM = { username: "", email: "", password: "", confirmPassword: "", firstname: "", lastname: "", studentCode: "", isActive: true };
const FIELDS = [
  { name: "username", label: "ชื่อผู้ใช้", required: true },
  { name: "email", label: "อีเมล", required: true },
  { name: "firstname", label: "ชื่อจริง", required: false },
  { name: "lastname", label: "นามสกุล", required: false },
  { name: "studentCode", label: "รหัสนิสิต", required: false },
  { name: "password", label: "รหัสผ่านเริ่มต้น", required: true },
  { name: "confirmPassword", label: "ยืนยันรหัสผ่าน", required: true },
] as const;

export function CreateUserDialog({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [role, setRole] = useState<RoleName>(ROLES.STUDENT);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (form.password !== form.confirmPassword) { setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน"); return; }
    setSaving(true);
    try {
      const { confirmPassword: _confirmation, ...values } = form;
      void _confirmation;
      const response = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, roles: [role] }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setError(json.message ?? "เพิ่มผู้ใช้งานไม่สำเร็จ"); return; }
      toast.success(`เพิ่มผู้ใช้งาน ${json.data.username} เรียบร้อยแล้ว`);
      setOpen(false);
      setForm(EMPTY_FORM);
      await onCreated();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่");
    } finally { setSaving(false); }
  }

  return (
    <>
      <Button onClick={() => { setForm(EMPTY_FORM); setRole(ROLES.STUDENT); setError(null); setShowPassword(false); setOpen(true); }}>
        <UserPlus />เพิ่มผู้ใช้งาน
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent showCloseButton={!saving} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้งาน</DialogTitle>
            <DialogDescription>กำหนดข้อมูลบัญชี รหัสผ่านเริ่มต้น และบทบาทของผู้ใช้ใหม่</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5" aria-busy={saving}>
            {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => {
                const password = field.name === "password" || field.name === "confirmPassword";
                return (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={`create-user-${field.name}`}>{field.label}{!field.required && <span className="text-xs text-muted-foreground">(ไม่บังคับ)</span>}</Label>
                    <Input id={`create-user-${field.name}`} name={field.name} value={form[field.name]} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                      type={password ? (showPassword ? "text" : "password") : field.name === "email" ? "email" : "text"}
                      autoComplete={password ? "new-password" : "off"} required={field.required} disabled={saving}
                      minLength={password ? 6 : undefined} maxLength={field.name === "studentCode" ? 50 : password ? undefined : 191} />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>รหัสผ่านอย่างน้อย 6 ตัวอักษร</p>
              <Button type="button" size="sm" variant="ghost" disabled={saving} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff /> : <Eye />}{showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              </Button>
            </div>
            <UserRoleSelector name="create-user-role" value={role} onChange={setRole} disabled={saving} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={form.isActive} disabled={saving} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />เปิดใช้งานบัญชี</label>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "กำลังเพิ่มผู้ใช้งาน..." : "เพิ่มผู้ใช้งาน"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
