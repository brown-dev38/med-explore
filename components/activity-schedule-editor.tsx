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
  const [form, setForm] = useState({ startsAt: "", endsAt: "" });

  function changeOpen(next: boolean) {
    if (saving || disabled) return;
    if (next) setForm({
      startsAt: toLocalInputValue(activity.startsAt),
      endsAt: toLocalInputValue(activity.endsAt),
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
    setSaving(true);
    try {
      const response = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: form.startsAt === toLocalInputValue(activity.startsAt) ? activity.startsAt : localInputToIso(form.startsAt),
          endsAt: form.endsAt === toLocalInputValue(activity.endsAt) ? activity.endsAt : localInputToIso(form.endsAt),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(json.message ?? "แก้ไขเวลากิจกรรมไม่สำเร็จ");
        if (response.status === 409) {
          setOpen(false);
          onConflict?.();
          router.refresh();
        }
        return;
      }
      setOpen(false);
      onSaved?.(json.data);
      toast.success("บันทึกเวลากิจกรรมเรียบร้อยแล้ว");
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
        <CalendarClock className="size-3.5" aria-hidden="true" />แก้ไขเวลากิจกรรม
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent showCloseButton={!saving} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขเวลากิจกรรม</DialogTitle>
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
