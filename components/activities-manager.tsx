"use client";

import { useState } from "react";
import Link from "next/link";
import { notifyActivityUpdate } from "@/lib/activity-live";
import { toast } from "sonner";
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { ActivityListItem, ActivityStatus } from "@/types/activity";
import { formatThaiDateTime, localInputToIso } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActivityScheduleEditor } from "@/components/activity-schedule-editor";
import { ActivityPublishButton } from "@/components/activity-publish-button";
import { useLiveActivityData } from "@/components/use-live-activity-data";

const STATUS_CONFIG: Record<
  ActivityStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "ฉบับร่าง", variant: "secondary" },
  PUBLISHED: { label: "เปิดรับลงทะเบียน", variant: "default" },
  COMPLETED: { label: "สิ้นสุดกิจกรรม", variant: "outline" },
  CANCELLED: { label: "ยกเลิกกิจกรรม", variant: "destructive" },
};

const emptyForm = {
  title: "",
  location: "",
  startsAt: "",
  endsAt: "",
  minMinutes: "90",
  description: "",
};

export function ActivitiesManager({
  initial,
  detailBasePath = "/organizer/activities",
  canDeleteAll = false,
}: {
  initial: ActivityListItem[];
  detailBasePath?: string;
  canDeleteAll?: boolean;
}) {
  const { data: items, setData: setItems, refresh } = useLiveActivityData("/api/activities", initial);
  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    description: "",
    confirmText: "ยืนยัน",
    variant: "default" as "default" | "destructive",
    action: async (): Promise<boolean> => false,
  });

  async function reload() {
    if (!await refresh()) toast.warning("บันทึกแล้ว กำลังรอเชื่อมต่อเพื่ออัปเดตรายการล่าสุด");
  }

  async function request(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        return false;
      }
      await reload();
      notifyActivityUpdate();
      return true;
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim() || !form.startsAt || !form.endsAt) {
      toast.error("กรุณากรอกชื่อกิจกรรมและช่วงเวลาให้ครบถ้วน");
      return;
    }
    const ok = await request("/api/activities", "POST", {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      startsAt: localInputToIso(form.startsAt),
      endsAt: localInputToIso(form.endsAt),
      minMinutes: Number(form.minMinutes) || 90,
    });
    if (ok) {
      toast.success("สร้างกิจกรรมใหม่เรียบร้อยแล้ว");
      setForm(emptyForm);
      setCreateOpen(false);
    }
  }

  function promptPublish(activity: ActivityListItem) {
    setConfirmConfig({
      title: `เปิดรับลงทะเบียน: ${activity.title}`,
      description:
        "เมื่อเปิดรับลงทะเบียนแล้ว นิสิตจะสามารถลงทะเบียนและสแกน QR เข้าร่วมกิจกรรมนี้ได้ คุณต้องการเปิดรับลงทะเบียนใช่หรือไม่?",
      confirmText: "เปิดรับลงทะเบียน",
      variant: "default",
      action: async () => {
        const ok = await request(`/api/activities/${activity.id}`, "PATCH", {
          status: "PUBLISHED",
        });
        if (ok) toast.success("เปิดรับลงทะเบียนกิจกรรมแล้ว");
        return ok;
      },
    });
    setConfirmOpen(true);
  }

  function promptComplete(activity: ActivityListItem) {
    setConfirmConfig({
      title: `ยืนยันสิ้นสุดกิจกรรม: ${activity.title}`,
      description:
        "เมื่อสิ้นสุดกิจกรรมแล้ว รายละเอียดของกิจกรรมจะไม่สามารถแก้ไขได้ คุณต้องการสิ้นสุดกิจกรรมนี้หรือไม่?",
      confirmText: "สิ้นสุดกิจกรรม",
      variant: "default",
      action: async () => {
        const ok = await request(`/api/activities/${activity.id}`, "PATCH", {
          status: "COMPLETED",
        });
        if (ok) toast.success("สิ้นสุดกิจกรรมเรียบร้อยแล้ว");
        return ok;
      },
    });
    setConfirmOpen(true);
  }

  function promptCancel(activity: ActivityListItem) {
    setConfirmConfig({
      title: `ยืนยันยกเลิกกิจกรรม: ${activity.title}`,
      description:
        "คุณต้องการยกเลิกกิจกรรมนี้หรือไม่? เมื่อยกเลิกแล้วจะไม่สามารถเปิดรับลงทะเบียนใหม่ได้",
      confirmText: "ยกเลิกกิจกรรม",
      variant: "destructive",
      action: async () => {
        const ok = await request(`/api/activities/${activity.id}`, "PATCH", {
          status: "CANCELLED",
        });
        if (ok) toast.success("ยกเลิกกิจกรรมเรียบร้อยแล้ว");
        return ok;
      },
    });
    setConfirmOpen(true);
  }

  function promptDelete(activity: ActivityListItem) {
    setConfirmConfig({
      title: `ยืนยันการลบกิจกรรม: ${activity.title}`,
      description: canDeleteAll
        ? "ลบกิจกรรมนี้ถาวร รวมผู้ลงทะเบียน เวลาเข้า–ออก QR ผู้ช่วยงาน แบบประเมิน และรายการดาวที่ผูกกับกิจกรรม ประวัติ Audit Log ยังคงอยู่ การลบไม่สามารถย้อนกลับได้ ยืนยันลบหรือไม่?"
        : "การลบกิจกรรมฉบับร่างนี้จะไม่สามารถย้อนกลับได้ คุณต้องการลบกิจกรรมนี้ใช่หรือไม่?",
      confirmText: "ลบกิจกรรม",
      variant: "destructive",
      action: async () => {
        const ok = await request(`/api/activities/${activity.id}`, "DELETE");
        if (ok) toast.success("ลบกิจกรรมเรียบร้อยแล้ว");
        return ok;
      },
    });
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            จัดการกิจกรรม
          </h1>
          <p className="text-sm text-muted-foreground">
            สร้างกิจกรรม เปิดรับลงทะเบียน สร้าง QR Code และบันทึกเวลาเข้าร่วมงาน
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={busy} className="gap-2">
          <Plus className="h-4 w-4" />
          สร้างกิจกรรมใหม่
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base font-semibold">
            รายการกิจกรรมทั้งหมด ({items.length})
          </CardTitle>
          <CardDescription className="text-xs">
            คลิกที่ชื่อกิจกรรมหรือปุ่มรายละเอียดเพื่อดูข้อมูลผู้ลงทะเบียนและจัดการ QR Code
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อกิจกรรม / สถานที่</TableHead>
                <TableHead>ช่วงเวลา</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ผู้ลงทะเบียน</TableHead>
                <TableHead className="text-right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    ยังไม่มีกิจกรรมในระบบ กรุณากดปุ่มสร้างกิจกรรมใหม่
                  </TableCell>
                </TableRow>
              )}
              {items.map((act) => {
                const statusInfo = STATUS_CONFIG[act.status];
                return (
                  <TableRow key={act.id}>
                    <TableCell>
                      <Link
                        href={`${detailBasePath}/${act.id}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                      >
                        {act.title}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      {act.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {act.location}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-foreground font-medium flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatThaiDateTime(act.startsAt)}
                      </div>
                      <div className="text-xs text-muted-foreground pl-4.5">
                        ถึง {formatThaiDateTime(act.endsAt)}
                      </div>
                      <div className="text-[11px] text-muted-foreground pl-4.5 flex items-center gap-1 mt-1 font-medium">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        เกณฑ์เวลา: <span className="font-semibold text-foreground">{act.minMinutes} นาที</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {act.participantCount} คน
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={
                            <Link href={`${detailBasePath}/${act.id}`}>
                              รายละเอียด
                            </Link>
                          }
                        />

                        {act.status === "DRAFT" && (
                          <>
                            <ActivityScheduleEditor
                              activity={act}
                              disabled={busy}
                              onSaved={(updated) => setItems((current) => current
                                .map((item) => item.id === updated.id ? { ...item, ...updated } : item)
                                .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)))}
                              onConflict={() => { void reload(); }}
                            />
                            <ActivityPublishButton
                              endsAt={act.endsAt}
                              onPublish={() => promptPublish(act)}
                              disabled={busy}
                            />
                          </>
                        )}

                        {act.status === "PUBLISHED" && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => promptComplete(act)}
                              disabled={busy}
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              สิ้นสุดกิจกรรม
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => promptCancel(act)}
                              disabled={busy}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              ยกเลิก
                            </Button>
                          </>
                        )}
                        {(canDeleteAll || act.status === "DRAFT") && (
                          <Button variant="destructive" size="sm" onClick={() => promptDelete(act)} disabled={busy}>
                            <Trash2 className="size-3.5" />ลบ
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal สร้างกิจกรรมใหม่ */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!busy) setCreateOpen(open); }}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>สร้างกิจกรรมใหม่</DialogTitle>
            <DialogDescription>
              กรอกข้อมูลกิจกรรม ช่วงเวลา และเงื่อนไขนาทีขั้นต่ำในการเข้าร่วม
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="act-title">ชื่อกิจกรรม</Label>
              <Input
                id="act-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="เช่น อบรมปฐมพยาบาลเบื้องต้น (CPR & AED)"
                disabled={busy}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="act-location">สถานที่จัดกิจกรรม</Label>
                <Input
                  id="act-location"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="เช่น ห้องบรรยาย 101"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="act-minMinutes">นาทีขั้นต่ำสำหรับดาว</Label>
                <Input
                  id="act-minMinutes"
                  type="number"
                  min={1}
                  value={form.minMinutes}
                  onChange={(e) =>
                    setForm({ ...form, minMinutes: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="act-start">วันและเวลาเริ่มต้น</Label>
                <Input
                  id="act-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="act-end">วันและเวลาสิ้นสุด</Label>
                <Input
                  id="act-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  disabled={busy}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="act-desc">รายละเอียดเพิ่มเติม (ไม่บังคับ)</Label>
              <textarea
                id="act-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                placeholder="รายละเอียด วิทยากร หรือสิ่งที่ต้องเตรียมมา..."
                disabled={busy}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                สร้างกิจกรรม
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reusable Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        variant={confirmConfig.variant}
        loading={busy}
        onConfirm={confirmConfig.action}
      />
    </div>
  );
}
