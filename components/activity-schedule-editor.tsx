"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ActivityDto } from "@/types/activity";
import { localInputToIso, toLocalInputValue } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ActivityScheduleEditor({ activity, disabled = false, onSaved, onConflict }: {
  activity: ActivityDto;
  disabled?: boolean;
  onSaved?: (activity: ActivityDto) => void;
  onConflict?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ startsAt: "", endsAt: "", minMinutes: "" });

  function changeOpen(next: boolean) {
    if (saving || disabled) return;
    if (next) setForm({
      startsAt: toLocalInputValue(activity.startsAt),
      endsAt: toLocalInputValue(activity.endsAt),
      minMinutes: String(activity.minMinutes),
    });
    setOpen(next);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled) return;
    if (!form.startsAt || !form.endsAt) {
      toast.error("กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ครบถ้วน");
      return;
    }
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      toast.error("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
      return;
    }
    const minMinutes = Number(form.minMinutes);
    if (!Number.isInteger(minMinutes) || minMinutes < 1 || minMinutes > 1440) {
      toast.error("เวลาขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 1,440 นาที");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: form.startsAt === toLocalInputValue(activity.startsAt) ? activity.startsAt : localInputToIso(form.startsAt),
          endsAt: form.endsAt === toLocalInputValue(activity.endsAt) ? activity.endsAt : localInputToIso(form.endsAt),
          minMinutes,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(json.message ?? "แก้ไขเวลาและเกณฑ์ขั้นต่ำไม่สำเร็จ");
        if (response.status === 409) {
          setOpen(false);
          onConflict?.();
          router.refresh();
        }
        return;
      }
      setOpen(false);
      onSaved?.(json.data);
      toast.success("บันทึกเวลาและเกณฑ์ขั้นต่ำเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  if (activity.status !== "DRAFT") return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled || saving} onClick={() => changeOpen(true)}>
        <CalendarClock className="size-3.5" aria-hidden="true" />แก้ไขเวลาและเกณฑ์
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent showCloseButton={!saving} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขเวลาและเกณฑ์ขั้นต่ำ</DialogTitle>
            <DialogDescription className="break-words">{activity.title} · แก้ไขได้เฉพาะกิจกรรมฉบับร่าง ก่อนเปิดรับลงทะเบียน</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5" aria-busy={saving}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${id}-start`}>วันและเวลาเริ่มกิจกรรม</Label>
                <Input id={`${id}-start`} type="datetime-local" required disabled={saving} value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-end`}>วันและเวลาสิ้นสุดกิจกรรม</Label>
                <Input id={`${id}-end`} type="datetime-local" required disabled={saving} min={form.startsAt || undefined} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น สามารถกำหนดกิจกรรมข้ามวันได้</p>
            <div className="space-y-2">
              <Label htmlFor={`${id}-min-minutes`}>เวลาเข้าร่วมขั้นต่ำสำหรับรับดาว (นาที)</Label>
              <Input id={`${id}-min-minutes`} type="number" min={1} max={1440} step={1} required disabled={saving} value={form.minMinutes} onChange={(event) => setForm({ ...form, minMinutes: event.target.value })} aria-describedby={`${id}-min-minutes-hint`} />
              <p id={`${id}-min-minutes-hint`} className="text-xs text-muted-foreground">กำหนดได้ 1–1,440 นาที ระบบใช้ตรวจเวลาที่นิสิตเข้าร่วมเพื่อพิจารณารับดาว</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>ยกเลิก</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
