"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Lock,
  RotateCcw,
} from "lucide-react";
import type { AcademicYearDto, AcademicYearStatus } from "@/types/academic-year";
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

const STATUS_CONFIG: Record<
  AcademicYearStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "ฉบับร่าง", variant: "secondary" },
  ACTIVE: { label: "ใช้งานอยู่", variant: "default" },
  CLOSED: { label: "ปิดแล้ว", variant: "destructive" },
};

type ConfirmActionState = {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  action: () => Promise<boolean>;
};

export function AcademicYearManager({
  initialYears,
}: {
  initialYears: AcademicYearDto[];
}) {
  const router = useRouter();
  const [years, setYears] = useState(initialYears);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ code: "", startsOn: "", endsOn: "" });
  const [editingYear, setEditingYear] = useState<AcademicYearDto | null>(null);
  const [editForm, setEditForm] = useState({ code: "", startsOn: "", endsOn: "" });
  const [busy, setBusy] = useState(false);

  const [confirmState, setConfirmState] = useState<ConfirmActionState>({
    open: false,
    title: "",
    description: "",
    action: async (): Promise<boolean> => false,
  });

  async function reload() {
    try {
      const res = await fetch("/api/academic-years");
      if (!res.ok) throw new Error("refresh failed");
      const json = await res.json();
      setYears(json.data);
    } catch {
      toast.warning("บันทึกแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้าจอ");
    }
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
      router.refresh();
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
    if (!form.code.trim() || !form.startsOn || !form.endsOn) {
      toast.error("กรุณากรอกรหัสและช่วงวันที่ให้ครบถ้วน");
      return;
    }
    const ok = await request("/api/academic-years", "POST", form);
    if (ok) {
      toast.success(`เพิ่มปีการศึกษา ${form.code} เรียบร้อยแล้ว`);
      setForm({ code: "", startsOn: "", endsOn: "" });
      setCreateOpen(false);
    }
  }

  function startEdit(year: AcademicYearDto) {
    setEditingYear(year);
    setEditForm({
      code: year.code,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
    });
    setEditOpen(true);
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingYear) return;
    const ok = await request(
      `/api/academic-years/${editingYear.id}`,
      "PATCH",
      editForm,
    );
    if (ok) {
      toast.success("บันทึกการแก้ไขปีการศึกษาแล้ว");
      setEditOpen(false);
      setEditingYear(null);
    }
  }

  function promptActivate(year: AcademicYearDto) {
    setConfirmState({
      open: true,
      title: `ยืนยันเปิดใช้งานปีการศึกษา ${year.code}`,
      description:
        "ระบบอนุญาตให้มีปีการศึกษาที่ใช้งานอยู่ได้เพียง 1 ปีเท่านั้น หากเปิดใช้งานปีนี้ ระบบจะทำการปิดปีการศึกษาที่ใช้งานอยู่เดิมโดยอัตโนมัติ คุณแน่ใจหรือไม่?",
      confirmText: "เปิดใช้งานปีนี้",
      variant: "default",
      action: async () => {
        const ok = await request(`/api/academic-years/${year.id}`, "PATCH", {
          status: "ACTIVE",
        });
        if (ok) {
          toast.success(`เปิดใช้งานปีการศึกษา ${year.code} แล้ว`);
        }
        return ok;
      },
    });
  }

  function promptClose(year: AcademicYearDto) {
    setConfirmState({
      open: true,
      title: `ยืนยันปิดปีการศึกษา ${year.code}`,
      description:
        "เมื่อปิดปีการศึกษาแล้ว จะไม่สามารถสร้างหรือแก้ไขกิจกรรมสำหรับปีนี้ได้ คุณต้องการปิดปีการศึกษานี้ใช่หรือไม่?",
      confirmText: "ปิดปีการศึกษา",
      variant: "destructive",
      action: async () => {
        const ok = await request(`/api/academic-years/${year.id}`, "PATCH", {
          status: "CLOSED",
        });
        if (ok) {
          toast.success(`ปิดปีการศึกษา ${year.code} แล้ว`);
        }
        return ok;
      },
    });
  }

  function promptReopen(year: AcademicYearDto) {
    setConfirmState({
      open: true,
      title: `เปิดใหม่ปีการศึกษา ${year.code}`,
      description:
        "ปีการศึกษานี้จะกลับสู่สถานะ 'ฉบับร่าง (DRAFT)' คุณต้องการเปิดใหม่ใช่หรือไม่?",
      confirmText: "เปิดใหม่",
      variant: "default",
      action: async () => {
        const ok = await request(`/api/academic-years/${year.id}`, "PATCH", {
          status: "DRAFT",
        });
        if (ok) {
          toast.success(`เปลี่ยนสถานะเป็นฉบับร่างแล้ว`);
        }
        return ok;
      },
    });
  }

  function promptDelete(year: AcademicYearDto) {
    setConfirmState({
      open: true,
      title: `ยืนยันการลบปีการศึกษา ${year.code}`,
      description: `ลบปีการศึกษา ${year.code} ถาวร รวมกิจกรรม ผู้เข้าร่วม เวลาเข้า–ออก QR ดาว แบบประเมิน และข้อมูลรางวัล/การแลกรางวัลของปีนี้ ประวัติ Audit Log ยังคงอยู่ การลบไม่สามารถย้อนกลับได้${year.status === "ACTIVE" ? "\nปีนี้กำลังใช้งานอยู่ หลังลบต้องเปิดใช้งานปีอื่นด้วยตนเอง" : ""}\nยืนยันลบหรือไม่?`,
      confirmText: "ลบข้อมูล",
      variant: "destructive",
      action: async () => {
        const ok = await request(`/api/academic-years/${year.id}`, "DELETE");
        if (ok) {
          toast.success(`ลบปีการศึกษา ${year.code} แล้ว`);
        }
        return ok;
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            จัดการปีการศึกษา
          </h1>
          <p className="text-sm text-muted-foreground">
            สร้าง เปิดใช้งาน และปิดรอบปีการศึกษาสำหรับการสะสมดาวกิจกรรม
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={busy} className="gap-2">
          <Plus className="h-4 w-4" />
          เพิ่มปีการศึกษา
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base font-semibold">
            รายการปีการศึกษาทั้งหมด ({years.length})
          </CardTitle>
          <CardDescription className="text-xs">
            มีปีการศึกษาที่เปิดใช้งาน (ACTIVE) ได้ครั้งละ 1 ปีเท่านั้น
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">รหัสปีการศึกษา</TableHead>
                <TableHead>ช่วงวันที่</TableHead>
                <TableHead className="w-32">สถานะ</TableHead>
                <TableHead className="text-right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-28 text-center text-muted-foreground"
                  >
                    ยังไม่มีข้อมูลปีการศึกษา กรุณากดปุ่มเพิ่มปีการศึกษา
                  </TableCell>
                </TableRow>
              )}
              {years.map((year) => {
                const statusInfo = STATUS_CONFIG[year.status];
                return (
                  <TableRow key={year.id}>
                    <TableCell className="font-semibold text-foreground">
                      {year.code}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {year.startsOn} &rarr; {year.endsOn}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {year.status === "DRAFT" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEdit(year)}
                              disabled={busy}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              แก้ไข
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => promptActivate(year)}
                              disabled={busy}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              เปิดใช้งาน
                            </Button>
                          </>
                        )}
                        {year.status === "ACTIVE" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => promptClose(year)}
                            disabled={busy}
                          >
                            <Lock className="mr-1 h-3.5 w-3.5" />
                            ปิดปีการศึกษา
                          </Button>
                        )}
                        {year.status === "CLOSED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => promptReopen(year)}
                            disabled={busy}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            เปิดใหม่
                          </Button>
                        )}
                        <Button variant="destructive" size="sm" onClick={() => promptDelete(year)} disabled={busy}>
                          <Trash2 className="size-3.5" />ลบ
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal เพิ่มปีการศึกษา */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!busy) setCreateOpen(open); }}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มปีการศึกษาใหม่</DialogTitle>
            <DialogDescription>
              กำหนดรหัสปีการศึกษาและช่วงวันที่เริ่มต้น-สิ้นสุด
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-code">รหัสปีการศึกษา</Label>
              <Input
                id="create-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="เช่น 2569"
                disabled={busy}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-start">วันเริ่มต้น</Label>
                <Input
                  id="create-start"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) =>
                    setForm({ ...form, startsOn: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-end">วันสิ้นสุด</Label>
                <Input
                  id="create-end"
                  type="date"
                  value={form.endsOn}
                  onChange={(e) =>
                    setForm({ ...form, endsOn: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
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
                เพิ่มปีการศึกษา
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal แก้ไขปีการศึกษา */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!busy) setEditOpen(open); }}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขปีการศึกษา {editingYear?.code}</DialogTitle>
            <DialogDescription>
              แก้ไขรหัสและช่วงวันที่ของปีการศึกษา (แก้ไขได้เฉพาะสถานะฉบับร่าง)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-code">รหัสปีการศึกษา</Label>
              <Input
                id="edit-code"
                value={editForm.code}
                onChange={(e) =>
                  setEditForm({ ...editForm, code: e.target.value })
                }
                disabled={busy}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-start">วันเริ่มต้น</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editForm.startsOn}
                  onChange={(e) =>
                    setEditForm({ ...editForm, startsOn: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end">วันสิ้นสุด</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={editForm.endsOn}
                  onChange={(e) =>
                    setEditForm({ ...editForm, endsOn: e.target.value })
                  }
                  disabled={busy}
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={busy}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                บันทึกการแก้ไข
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reusable Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) =>
          setConfirmState((prev) => ({ ...prev, open }))
        }
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
        loading={busy}
        onConfirm={confirmState.action}
      />
    </div>
  );
}
