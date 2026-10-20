"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserDto } from "@/types/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ResetUserPasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const fieldId = useId();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("รหัสผ่านยาวเกินไป"); return; }
    if (password !== confirmPassword) { setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน"); return; }
    inFlight.current = true;
    setSaving(true);
    try {
      const response = await fetch(`/api/users/${user.id}/password`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ"); return; }
      setPassword(""); setConfirmPassword(""); setShowPassword(false);
      toast.success(`เปลี่ยนรหัสผ่านของ ${user.username} เรียบร้อยแล้ว`);
      onClose();
    } catch { setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่"); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent showCloseButton={!saving} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>เปลี่ยนรหัสผ่านผู้ใช้งาน</DialogTitle>
        <DialogDescription>{user.username} · {user.email}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" aria-busy={saving}>
        <p className="text-sm text-muted-foreground">ดูรหัสผ่านเดิมไม่ได้ คุณสามารถตั้งรหัสผ่านใหม่และแจ้งให้ผู้ใช้ทราบ รหัสผ่านนี้ใช้เข้าสู่ระบบ MedExplore Star</p>
        {error && <Alert variant="destructive" role="alert"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-password`}>รหัสผ่านใหม่</Label>
          <Input id={`${fieldId}-password`} name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={72} autoComplete="new-password" disabled={saving} aria-describedby={`${fieldId}-hint`} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-confirm`}>ยืนยันรหัสผ่านใหม่</Label>
          <Input id={`${fieldId}-confirm`} name="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} maxLength={72} autoComplete="new-password" disabled={saving} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">อย่างน้อย 6 ตัวอักษร</p>
          <Button type="button" variant="ghost" size="sm" disabled={saving} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}{showPassword ? "ซ่อนรหัสผ่านใหม่" : "แสดงรหัสผ่านใหม่"}</Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
