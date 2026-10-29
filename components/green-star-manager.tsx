"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Plus, Search, RefreshCw, FileSpreadsheet, LockKeyhole, X } from "lucide-react";
import type { HelperAssignmentDto, HelperStatus } from "@/types/activity";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GreenStarExcelImport } from "@/components/green-star-excel-import";

type Candidate = { id: string; name: string; studentCode: string | null };
type PendingAction = { helper: HelperAssignmentDto; status: HelperStatus };
const STATUS_LABEL: Record<HelperStatus, string> = { ASSIGNED: "รอยืนยันการช่วยงาน", COMPLETED: "ช่วยงานสำเร็จ", CANCELLED: "ยกเลิกแล้ว" };

export function GreenStarManager({ activityId, activityTitle, yearId, closed, initialHelpers }: { activityId: string; activityTitle: string; yearId: string; closed: boolean; initialHelpers: HelperAssignmentDto[] }) {
  const router = useRouter();
  const [helpers, setHelpers] = useState(initialHelpers);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<HelperStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Candidate[]>([]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const endpoint = `/api/activities/${activityId}/helpers`;
  const selectedIds = new Set(selectedStudents.map((student) => student.id));
  const allDisplayedSelected = candidates.length > 0 && candidates.every((student) => selectedIds.has(student.id));

  function toggleStudent(student: Candidate) {
    setSelectedStudents((selected) => selected.some((item) => item.id === student.id)
      ? selected.filter((item) => item.id !== student.id)
      : selected.length < 500 ? [...selected, student] : selected);
  }

  function toggleDisplayedStudents() {
    const displayedIds = new Set(candidates.map((student) => student.id));
    setSelectedStudents((selected) => {
      const ids = new Set(selected.map((student) => student.id));
      return candidates.every((student) => ids.has(student.id))
        ? selected.filter((student) => !displayedIds.has(student.id))
        : [...new Map([...selected, ...candidates].map((student) => [student.id, student])).values()].slice(0, 500);
    });
  }

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

  async function mutate(url: string, method: string, body?: unknown) {
    if (inFlight.current || closed) return false;
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
  const visibleHelpers = helpers.filter((helper) => (statusFilter === "ALL" || helper.status === statusFilter) && `${helper.userName} ${helper.studentCode ?? ""} ${helper.description ?? ""}`.toLocaleLowerCase().includes(needle));
  const totalPages = Math.max(1, Math.ceil(visibleHelpers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const pageHelpers = visibleHelpers.slice(offset, offset + pageSize);
  const pageNumbers = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((number) => number >= 1 && number <= totalPages).sort((a, b) => a - b);
  const awarded = helpers.reduce((sum, helper) => sum + helper.greenStarPoints, 0);
  return (
    <div className="space-y-4">
      {closed && <p role="status" className="flex items-start gap-2 rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" />ปีการศึกษานี้ปิดแล้ว สามารถดูรายชื่อและประวัติการให้ดาวได้</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {[{ label: "นิสิตช่วยงาน", value: `${helpers.length} คน` }, { label: "รอยืนยัน", value: `${helpers.filter((helper) => helper.status === "ASSIGNED").length} คน` }, { label: "ดาวสีเขียวที่ให้แล้ว", value: `${awarded} ดาว` }].map((stat) => <Card key={stat.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{stat.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1"><CardTitle id="helper-list-title" className="text-lg">รายชื่อนิสิตช่วยกิจกรรม</CardTitle><CardDescription className="break-words">{activityTitle}</CardDescription></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await reload(); } catch { toast.error("โหลดรายชื่อผู้ช่วยงานไม่สำเร็จ"); } finally { setBusy(false); } }}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />รีเฟรช</Button>
              <Button variant="outline" size="sm" disabled={closed || busy} aria-haspopup="dialog" aria-expanded={importOpen} aria-controls="helper-import-dialog" onClick={() => setImportOpen(true)}><FileSpreadsheet className="size-4" />นำเข้า Excel</Button>
              <Button size="sm" disabled={closed || busy} onClick={() => { setCandidates([]); setQuery(""); setSelectedStudents([]); setDescription(""); setSearchError(""); setSearching(true); setAddOpen(true); }}><Plus className="size-4" />เพิ่มนิสิตช่วยงาน</Button></div>
          </div>
          <p className="text-xs text-muted-foreground">เพิ่มนิสิตช่วยงานหรือนำเข้า Excel แล้วได้รับคนละ 1 ดาวสีเขียวทันที</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 basis-full space-y-2 sm:flex-1 sm:basis-auto"><Label htmlFor="helper-filter">ค้นหานิสิต</Label><Input id="helper-filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} placeholder="ชื่อ รหัสนิสิต หรือหน้าที่ช่วยงาน" /></div>
            <div className="min-w-40 flex-1 space-y-2 sm:flex-none"><Label htmlFor="helper-status-filter">สถานะการช่วยงาน</Label><select id="helper-status-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as HelperStatus | "ALL"); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="ALL">ทุกสถานะ</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {(filter || statusFilter !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { setFilter(""); setStatusFilter("ALL"); setPage(1); }}>ล้างตัวกรอง</Button>}
          </div>
        </CardHeader>
        <CardContent aria-busy={busy} className="overflow-x-auto p-0">
          <Table aria-labelledby="helper-list-title"><TableHeader><TableRow><TableHead>นิสิต</TableHead><TableHead>หน้าที่ช่วยงาน</TableHead><TableHead>สถานะ</TableHead><TableHead>ดาวสีเขียว</TableHead><TableHead className="text-right">การจัดการ</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleHelpers.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{helpers.length ? "ไม่พบรายชื่อตามเงื่อนไขที่เลือก" : "ยังไม่มีนิสิตช่วยงาน เริ่มจากเพิ่มนิสิตหรือนำเข้ารายชื่อจาก Excel"}</TableCell></TableRow>}
              {pageHelpers.map((helper) => <TableRow key={helper.id}>
                <TableCell><p className="font-medium">{helper.userName}</p><p className="text-xs text-muted-foreground">{helper.studentCode ?? "—"}</p></TableCell>
                <TableCell className="max-w-xs whitespace-normal break-words">{helper.description ?? "ผู้ช่วยงานทั่วไป"}</TableCell>
                <TableCell><Badge variant={helper.status === "CANCELLED" ? "destructive" : "secondary"}>{STATUS_LABEL[helper.status]}</Badge>{helper.completedAt && <p className="mt-1 text-xs text-muted-foreground">{formatThaiDateTime(helper.completedAt)}</p>}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Award className="size-4" />{helper.greenStarPoints} ดาว</span></TableCell>
                <TableCell><div className="flex flex-wrap justify-end gap-2">
                  {helper.status === "ASSIGNED" && <Button size="sm" disabled={closed || busy} onClick={() => setPending({ helper, status: "COMPLETED" })}>ยืนยันและให้ 1 ดาว</Button>}
                  <Button variant="outline" size="sm" disabled={closed || busy} onClick={() => setPending({ helper, status: "CANCELLED" })}>ยกเลิกการช่วยงาน</Button>
                </div></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
        <div className="space-y-3 border-t p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">แสดง {pageHelpers.length ? offset + 1 : 0}–{offset + pageHelpers.length} จาก {visibleHelpers.length} รายการ{visibleHelpers.length !== helpers.length && ` (ทั้งหมด ${helpers.length} คน)`}</p>
            <div className="flex items-center gap-2"><Label htmlFor="helper-page-size">รายการต่อหน้า</Label><select id="helper-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></div>
          </div>
          <nav aria-label="หน้ารายชื่อนิสิตช่วยกิจกรรม" className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</Button>
            {pageNumbers.map((number, index) => <span key={number} className="inline-flex items-center gap-2">
              {index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true" className="text-muted-foreground">…</span>}
              <Button size="sm" variant={number === currentPage ? "default" : "outline"} aria-label={`หน้า ${number}`} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</Button>
            </span>)}
            <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>ถัดไป</Button>
            <span className="text-sm text-muted-foreground">หน้า {currentPage} / {totalPages}</span>
          </nav>
        </div>
      </Card>

      <Dialog open={addOpen} onOpenChange={(open) => { if (!busy) setAddOpen(open); }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader><DialogTitle>เพิ่มนิสิตช่วยงาน</DialogTitle><DialogDescription>{activityTitle} · เลือกนิสิตได้หลายคน บันทึกการช่วยงานสำเร็จและให้คนละ 1 ดาวสีเขียวทันที</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedStudents.length) return;
            if (await mutate(endpoint, "POST", { userIds: selectedStudents.map((student) => student.id), description: description.trim() || null })) {
              setAddOpen(false);
              setSelectedStudents([]);
            }
          }}>
            <div className="space-y-2"><Label htmlFor="helper-search"><Search className="size-4" />ค้นหานิสิต</Label><Input id="helper-search" value={query} maxLength={100} disabled={busy} onChange={(event) => { setQuery(event.target.value); setCandidates([]); setSearchError(""); setSearching(true); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="ชื่อ รหัสนิสิต หรืออีเมล" /></div>
            {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{searching ? "กำลังค้นหา..." : `แสดง ${candidates.length} คน · เลือกแล้ว ${selectedStudents.length}/500 คน`}</span>
                <Button type="button" variant="ghost" size="xs" disabled={busy || searching || !candidates.length || (!allDisplayedSelected && selectedStudents.length >= 500)} onClick={toggleDisplayedStudents}>{allDisplayedSelected ? "ยกเลิกเลือกทั้งหมดที่แสดง" : "เลือกทั้งหมดที่แสดง"}</Button>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg border p-2" aria-busy={searching}>
                {searching ? <p role="status" className="py-4 text-center text-sm text-muted-foreground">กำลังค้นหานิสิต...</p>
                  : candidates.length ? <fieldset className="space-y-1"><legend className="sr-only">นิสิตที่ยังไม่ได้รับมอบหมาย (เลือกได้หลายคน)</legend>{candidates.map((student) => {
                    const checked = selectedIds.has(student.id);
                    return <label key={student.id} onMouseDown={(event) => event.preventDefault()} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted ${checked ? "bg-primary/5" : ""}`}>
                      <input type="checkbox" value={student.id} checked={checked} disabled={busy || (!checked && selectedStudents.length >= 500)} onChange={() => toggleStudent(student)} className="size-4 shrink-0 accent-primary" />
                      <span className="min-w-0"><span className="block break-words font-medium">{student.name}</span><span className="text-xs text-muted-foreground">{student.studentCode ?? "ไม่มีรหัสนิสิต"}</span></span>
                    </label>;
                  })}</fieldset> : <p className="py-4 text-center text-sm text-muted-foreground">{searchError ? "ไม่สามารถโหลดรายชื่อได้ กรุณาลองค้นหาอีกครั้ง" : "ไม่พบนิสิตที่เพิ่มได้"}</p>}
              </div>
              <p className="text-xs text-muted-foreground">เลือกได้สูงสุด 500 คนต่อครั้ง แสดงครั้งละไม่เกิน 100 คน ค้นหาเพิ่มได้โดยรายชื่อที่เลือกไว้ยังคงอยู่</p>
            </div>
            {selectedStudents.length > 0 && <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">เลือกแล้ว {selectedStudents.length} คน</p><Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setSelectedStudents([])}>ล้างที่เลือก</Button></div>
              <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">{selectedStudents.slice(0, 8).map((student) => <span key={student.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background py-1 pl-2 pr-1 text-xs"><span className="truncate">{student.name}</span><button type="button" disabled={busy} aria-label={`นำ ${student.name} ออกจากรายชื่อที่เลือก`} onClick={() => toggleStudent(student)} className="rounded p-1 hover:bg-muted"><X className="size-3" /></button></span>)}{selectedStudents.length > 8 && <span className="inline-flex items-center rounded-md border bg-background px-2 py-1 text-xs font-medium">+{selectedStudents.length - 8}</span>}</div>
            </div>}
            <div className="space-y-2"><Label htmlFor="helper-description">หน้าที่ช่วยงาน</Label><Input id="helper-description" value={description} maxLength={1000} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น เตรียมสถานที่ ลงทะเบียน หรือจัดอุปกรณ์" /></div>
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setAddOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={busy || !selectedStudents.length}>{busy ? "กำลังบันทึก..." : `เพิ่มนิสิตและให้คนละ 1 ดาว (${selectedStudents.length} คน)`}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent id="helper-import-dialog" className="sm:max-w-3xl">
          <DialogHeader className="sr-only"><DialogTitle>นำเข้า Excel</DialogTitle><DialogDescription>นำเข้ารายชื่อนิสิตช่วยงานสำหรับ {activityTitle} และให้คนละ 1 ดาวสีเขียว</DialogDescription></DialogHeader>
          <GreenStarExcelImport target={{ mode: "activity", academicYearId: yearId, activityId }} targetLabel={activityTitle} disabled={closed || busy} onImported={reload} />
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null); }} loading={busy}
        title={pending?.status === "COMPLETED" ? "ยืนยันการช่วยงานและให้ดาวสีเขียว" : pending?.status === "CANCELLED" ? "ยกเลิกการช่วยงาน" : "มอบหมายงานใหม่"}
        description={pending ? `${pending.helper.userName} · ${pending.helper.studentCode ?? "ไม่มีรหัสนิสิต"}\n${activityTitle}\n${pending.status === "COMPLETED" ? "ยืนยันว่าช่วยงานสำเร็จและให้ 1 ดาวสีเขียว รายการเดิมจะไม่ให้ดาวซ้ำ" : pending.status === "CANCELLED" ? "ลบรายชื่อนิสิตออกจากการช่วยงานกิจกรรมนี้ และนำดาวสีเขียวที่เคยให้จากรายการนี้ออก" : "เปลี่ยนกลับเป็นรอยืนยันการช่วยงาน โดยยังไม่ให้ดาวสีเขียว"}` : ""}
        variant={pending?.status === "CANCELLED" ? "destructive" : "default"} confirmText={pending?.status === "COMPLETED" ? "ยืนยันและให้ดาว" : "ยืนยัน"}
        onConfirm={async () => {
          if (!pending) return false;
          if (pending.status !== "CANCELLED") return mutate(`${endpoint}/${pending.helper.id}`, "PATCH", { status: pending.status });
          const removed = await mutate(`${endpoint}/${pending.helper.id}`, "DELETE");
          if (removed) setHelpers((current) => current.filter((helper) => helper.id !== pending.helper.id));
          return removed;
        }} />
    </div>
  );
}
