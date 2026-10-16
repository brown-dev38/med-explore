"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Plus, Search, RefreshCw } from "lucide-react";
import type { HelperAssignmentDto, HelperStatus } from "@/types/activity";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Candidate = { id: string; name: string; studentCode: string | null };
type PendingAction = { helper: HelperAssignmentDto; status: HelperStatus };
const STATUS_LABEL: Record<HelperStatus, string> = { ASSIGNED: "รอยืนยันการช่วยงาน", COMPLETED: "ช่วยงานสำเร็จ", CANCELLED: "ยกเลิกแล้ว" };

export function GreenStarManager({ activityId, activityTitle, initialHelpers }: { activityId: string; activityTitle: string; initialHelpers: HelperAssignmentDto[] }) {
  const router = useRouter();
  const [helpers, setHelpers] = useState(initialHelpers);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const endpoint = `/api/activities/${activityId}/helpers`;

  useEffect(() => {
    if (!addOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(`${endpoint}/candidates?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message ?? "ค้นหานิสิตไม่สำเร็จ");
        if (!controller.signal.aborted) setCandidates(json.data);
      } catch (error) {
        if (!controller.signal.aborted) { setCandidates([]); setSearchError(error instanceof Error ? error.message : "ค้นหานิสิตไม่สำเร็จ"); }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [addOpen, query, endpoint]);

  async function reload() {
    const response = await fetch(endpoint);
    const json = await response.json();
    if (!response.ok) throw new Error(json.message ?? "โหลดรายชื่อผู้ช่วยงานไม่สำเร็จ");
    setHelpers(json.data);
  }

  async function mutate(url: string, method: string, body: unknown) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? "บันทึกข้อมูลไม่สำเร็จ");
      toast.success("บันทึกข้อมูลเรียบร้อยแล้ว");
      try { await reload(); } catch { toast.warning("บันทึกแล้ว แต่โหลดรายชื่อล่าสุดไม่สำเร็จ กรุณารีเฟรช"); }
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  const needle = filter.trim().toLocaleLowerCase();
  const visibleHelpers = helpers.filter((helper) => `${helper.userName} ${helper.studentCode ?? ""} ${helper.description ?? ""}`.toLocaleLowerCase().includes(needle));
  const awarded = helpers.reduce((sum, helper) => sum + helper.greenStarPoints, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[{ label: "นิสิตช่วยงาน", value: `${helpers.length} คน` }, { label: "รอยืนยัน", value: `${helpers.filter((helper) => helper.status === "ASSIGNED").length} คน` }, { label: "ดาวสีเขียวที่ให้แล้ว", value: `${awarded} ดาว` }].map((stat) => <Card key={stat.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{stat.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">{activityTitle}</CardTitle>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await reload(); } catch { toast.error("โหลดรายชื่อผู้ช่วยงานไม่สำเร็จ"); } finally { setBusy(false); } }}><RefreshCw className="size-4" />รีเฟรช</Button>
              <Button size="sm" disabled={busy} onClick={() => { setCandidates([]); setQuery(""); setStudentId(""); setDescription(""); setSearching(true); setAddOpen(true); }}><Plus className="size-4" />เพิ่มนิสิตช่วยงาน</Button></div>
          </div>
          <div className="space-y-2"><Label htmlFor="helper-filter">ค้นหาในรายชื่อผู้ช่วยงาน</Label><Input id="helper-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ชื่อ รหัสนิสิต หรือหน้าที่ช่วยงาน" /></div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table><TableHeader><TableRow><TableHead>นิสิต</TableHead><TableHead>หน้าที่ช่วยงาน</TableHead><TableHead>สถานะ</TableHead><TableHead>ดาวสีเขียว</TableHead><TableHead className="text-right">การจัดการ</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleHelpers.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{helpers.length ? "ไม่พบรายชื่อตามคำค้นหา" : "ยังไม่มีนิสิตช่วยงานในกิจกรรมนี้"}</TableCell></TableRow>}
              {visibleHelpers.map((helper) => <TableRow key={helper.id}>
                <TableCell><p className="font-medium">{helper.userName}</p><p className="text-xs text-muted-foreground">{helper.studentCode ?? "—"}</p></TableCell>
                <TableCell className="max-w-xs whitespace-normal break-words">{helper.description ?? "ผู้ช่วยงานทั่วไป"}</TableCell>
                <TableCell><Badge variant={helper.status === "CANCELLED" ? "destructive" : "secondary"}>{STATUS_LABEL[helper.status]}</Badge>{helper.completedAt && <p className="mt-1 text-xs text-muted-foreground">{formatThaiDateTime(helper.completedAt)}</p>}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Award className="size-4" />{helper.greenStarPoints} ดาว</span></TableCell>
                <TableCell><div className="flex flex-wrap justify-end gap-2">
                  {helper.status === "ASSIGNED" && <Button size="sm" disabled={busy} onClick={() => setPending({ helper, status: "COMPLETED" })}>ยืนยันและให้ 1 ดาวสีเขียว</Button>}
                  {helper.status !== "CANCELLED" && <Button variant="outline" size="sm" disabled={busy} onClick={() => setPending({ helper, status: "CANCELLED" })}>ยกเลิกการช่วยงาน</Button>}
                  {helper.status === "CANCELLED" && <Button variant="outline" size="sm" disabled={busy} onClick={() => setPending({ helper, status: "ASSIGNED" })}>มอบหมายใหม่</Button>}
                </div></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(open) => { if (!busy) setAddOpen(open); }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader><DialogTitle>เพิ่มนิสิตช่วยงาน</DialogTitle><DialogDescription>{activityTitle} · เพิ่มรายชื่อก่อนยืนยันให้ 1 ดาวสีเขียวเมื่อช่วยงานสำเร็จ</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!studentId) return; if (await mutate(endpoint, "POST", { userId: studentId, description: description.trim() || null })) setAddOpen(false); }}>
            <div className="space-y-2"><Label htmlFor="helper-search"><Search className="size-4" />ค้นหานิสิต</Label><Input id="helper-search" value={query} disabled={busy} onChange={(event) => { setQuery(event.target.value); setStudentId(""); setCandidates([]); setSearching(true); }} placeholder="ชื่อ รหัสนิสิต หรืออีเมล" /></div>
            {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
            <div className="space-y-2"><Label htmlFor="helper-student">นิสิตที่ยังไม่ได้รับมอบหมาย</Label>
              <select id="helper-student" value={studentId} disabled={busy || searching} required onChange={(event) => setStudentId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">{searching ? "กำลังค้นหา..." : candidates.length ? "เลือกนิสิต" : "ไม่พบนิสิตที่เพิ่มได้"}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.studentCode ?? "—"} · {candidate.name}</option>)}</select>
              <p className="text-xs text-muted-foreground">แสดงสูงสุด 100 คน ใช้คำค้นหาเพื่อระบุนิสิต</p>
            </div>
            <div className="space-y-2"><Label htmlFor="helper-description">หน้าที่ช่วยงาน</Label><Input id="helper-description" value={description} maxLength={1000} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น เตรียมสถานที่ ลงทะเบียน หรือจัดอุปกรณ์" /></div>
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setAddOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={busy || !studentId || searching}>{busy ? "กำลังบันทึก..." : "เพิ่มนิสิตช่วยงาน"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null); }} loading={busy}
        title={pending?.status === "COMPLETED" ? "ยืนยันการช่วยงานและให้ดาวสีเขียว" : pending?.status === "CANCELLED" ? "ยกเลิกการช่วยงาน" : "มอบหมายงานใหม่"}
        description={pending ? `${pending.helper.userName} · ${pending.helper.studentCode ?? "ไม่มีรหัสนิสิต"}\n${activityTitle}\n${pending.status === "COMPLETED" ? "ยืนยันว่าช่วยงานสำเร็จและให้ 1 ดาวสีเขียว รายการเดิมจะไม่ให้ดาวซ้ำ" : pending.status === "CANCELLED" ? "ยกเลิกรายการช่วยงานนี้ และนำดาวสีเขียวที่เคยให้จากรายการนี้ออก" : "เปลี่ยนกลับเป็นรอยืนยันการช่วยงาน โดยยังไม่ให้ดาวสีเขียว"}` : ""}
        variant={pending?.status === "CANCELLED" ? "destructive" : "default"} confirmText={pending?.status === "COMPLETED" ? "ยืนยันและให้ดาว" : "ยืนยัน"}
        onConfirm={async () => pending ? mutate(`${endpoint}/${pending.helper.id}`, "PATCH", { status: pending.status }) : false} />
    </div>
  );
}
