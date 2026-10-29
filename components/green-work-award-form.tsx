"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Loader2, Search, X } from "lucide-react";
import type { GreenWorkCandidate } from "@/lib/green-star-work";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Submission = { userIds: string[]; academicYearId: string; description: string; requestId: string; students: GreenWorkCandidate[] };
type SearchResult = { query: string; candidates: GreenWorkCandidate[]; error: string };

export function GreenWorkAwardForm({ yearId, yearCode, closed, initialCandidates, onAwarded }: { yearId: string; yearCode: string; closed: boolean; initialCandidates: GreenWorkCandidate[]; onAwarded?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<GreenWorkCandidate[]>([]);
  const [description, setDescription] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const normalizedQuery = query.trim();
  const searching = Boolean(normalizedQuery && result?.query !== normalizedQuery);
  const candidates = normalizedQuery ? (result?.query === normalizedQuery ? result.candidates : []) : initialCandidates;
  const searchError = normalizedQuery && result?.query === normalizedQuery ? result.error : "";
  const selectedIds = new Set(selectedStudents.map((student) => student.id));
  const allDisplayedSelected = candidates.length > 0 && candidates.every((student) => selectedIds.has(student.id));

  useEffect(() => {
    if (closed || !normalizedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/green-stars/candidates?q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal, cache: "no-store" });
        const json = await response.json();
        if (!response.ok) throw new Error(json.message ?? "ค้นหานิสิตไม่สำเร็จ");
        if (!controller.signal.aborted) setResult({ query: normalizedQuery, candidates: json.data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query: normalizedQuery, candidates: [], error: error instanceof Error ? error.message : "ค้นหานิสิตไม่สำเร็จ" });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [normalizedQuery, closed, searchRetry]);

  function toggleStudent(student: GreenWorkCandidate) {
    setSelectedStudents((selected) => selected.some((item) => item.id === student.id)
      ? selected.filter((item) => item.id !== student.id)
      : selected.length < 500 ? [...selected, student] : selected);
  }

  function toggleDisplayedStudents() {
    const displayedIds = new Set(candidates.map((student) => student.id));
    setSelectedStudents((selected) => {
      const ids = new Set(selected.map((student) => student.id));
      if (candidates.every((student) => ids.has(student.id))) {
        return selected.filter((student) => !displayedIds.has(student.id));
      }
      return [...new Map([...selected, ...candidates].map((student) => [student.id, student])).values()].slice(0, 500);
    });
  }

  async function confirmAward() {
    if (!submission || inFlight.current || closed) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      const body = { userIds: submission.userIds, academicYearId: submission.academicYearId, description: submission.description, requestId: submission.requestId };
      const response = await fetch("/api/green-stars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? "บันทึกดาวสีเขียวไม่สำเร็จ");
      toast.success(`บันทึกงานช่วยเหลือและให้คนละ 1 ดาวสีเขียวแก่ ${submission.userIds.length} คนแล้ว`);
      request.current = null;
      setDescription("");
      setSelectedStudents([]);
      setQuery("");
      router.refresh();
      onAwarded?.();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ สามารถลองยืนยันข้อมูลเดิมอีกครั้งได้");
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Award className="size-5 text-emerald-600" />บันทึกงานช่วยเหลือและให้ดาวสีเขียว</CardTitle>
        <CardDescription>ปีการศึกษา {yearCode} · เลือกนิสิตได้หลายคน ให้คนละ 1 ดาวสีเขียวสำหรับงานเดียวกัน</CardDescription>
      </CardHeader>
      <CardContent>
        {closed ? <p className="text-sm text-muted-foreground">ปีการศึกษานี้ปิดแล้ว ดูประวัติได้ แต่ไม่สามารถเพิ่มดาวได้</p> : (
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (closed || inFlight.current || !selectedStudents.length || !description.trim()) return;
            const userIds = selectedStudents.map((student) => student.id).sort();
            const payload = { userIds, academicYearId: yearId, description: description.trim() };
            const signature = JSON.stringify(payload);
            if (request.current?.payload !== signature) request.current = { payload: signature, id: crypto.randomUUID() };
            setSubmission({ ...payload, requestId: request.current.id, students: [...selectedStudents] });
          }}>
            <div className="space-y-2">
              <p id="work-student-label" className="text-sm font-medium">นิสิตที่ช่วยงาน</p>
              <div aria-labelledby="work-student-label" aria-describedby="work-student-hint">
                <div id="work-student-picker" className="space-y-2">
                  <Label htmlFor="work-student-query" className="mb-2"><Search className="size-4" />ค้นหานิสิต</Label>
                  <Input id="work-student-query" value={query} maxLength={100} disabled={busy} placeholder="พิมพ์ชื่อ รหัสนิสิต หรืออีเมลเพื่อค้นหา" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                  <div className="my-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{searching ? "กำลังค้นหา..." : `แสดง ${candidates.length} คน · เลือกแล้ว ${selectedStudents.length}/500 คน`}</span>
                    <Button type="button" variant="ghost" size="xs" disabled={busy || searching || !candidates.length || (!allDisplayedSelected && selectedStudents.length >= 500)} onClick={toggleDisplayedStudents}>{allDisplayedSelected ? "ยกเลิกเลือกทั้งหมดที่แสดง" : "เลือกทั้งหมดที่แสดง"}</Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto" aria-busy={searching}>
                    {searching ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />กำลังค้นหานิสิต...</p>
                      : searchError ? <div className="space-y-2 py-3"><p role="alert" className="text-sm text-destructive">{searchError}</p><Button type="button" variant="outline" size="sm" onClick={() => { setResult(null); setSearchRetry((value) => value + 1); }}>ลองค้นหาอีกครั้ง</Button></div>
                        : candidates.length ? <fieldset className="space-y-1"><legend className="sr-only">รายชื่อนิสิตที่เลือกได้</legend>{candidates.map((student) => {
                          const checked = selectedIds.has(student.id);
                          return <label key={student.id} onMouseDown={(event) => event.preventDefault()} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted ${checked ? "bg-primary/5" : ""}`}>
                            <input type="checkbox" value={student.id} checked={checked} disabled={busy || (!checked && selectedStudents.length >= 500)} onChange={() => toggleStudent(student)} className="size-4 shrink-0 accent-primary" />
                            <span className="min-w-0"><span className="block break-words font-medium">{student.name}</span><span className="text-xs text-muted-foreground">{student.studentCode ?? "ไม่มีรหัสนิสิต"}</span></span>
                          </label>;
                        })}</fieldset> : <p className="py-6 text-center text-sm text-muted-foreground">{normalizedQuery ? "ไม่พบนิสิตที่ตรงกับคำค้นหา" : "ยังไม่มีนิสิตที่เปิดใช้งาน"}</p>}
                  </div>
                </div>
              </div>
              <p id="work-student-hint" className="text-xs text-muted-foreground">ติ๊กเลือกได้หลายคน สูงสุด 500 คนต่อครั้ง แสดงครั้งละไม่เกิน 100 คน และค้นหาเพิ่มได้โดยรายชื่อที่เลือกไว้ยังคงอยู่</p>
              {selectedStudents.length > 0 && <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">เลือกแล้ว {selectedStudents.length} คน</p><Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setSelectedStudents([])}>ล้างที่เลือก</Button></div>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">{selectedStudents.slice(0, 8).map((student) => <span key={student.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background py-1 pl-2 pr-1 text-xs"><span className="truncate">{student.name}</span><button type="button" disabled={busy} aria-label={`นำ ${student.name} ออกจากรายชื่อที่เลือก`} onClick={() => toggleStudent(student)} className="rounded p-1 hover:bg-muted"><X className="size-3" /></button></span>)}{selectedStudents.length > 8 && <span className="inline-flex items-center rounded-md border bg-background px-2 py-1 text-xs font-medium">+{selectedStudents.length - 8}</span>}</div>
              </div>}
            </div>
            <div className="space-y-2"><Label htmlFor="work-description">งานที่ช่วยเหลือ</Label><textarea id="work-description" required maxLength={1000} rows={3} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น ช่วยจัดเอกสาร เตรียมห้องประชุม หรือช่วยงานคณะ" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></div>
            <Button type="submit" disabled={busy || !selectedStudents.length || !description.trim()}>บันทึกงานและให้คนละ 1 ดาวสีเขียว{selectedStudents.length > 0 && ` (${selectedStudents.length} คน)`}</Button>
          </form>
        )}
      </CardContent>
      <ConfirmDialog open={submission !== null} onOpenChange={(open) => { if (!open && !busy) setSubmission(null); }} loading={busy} title="ยืนยันบันทึกงานช่วยเหลือและให้ดาวสีเขียว" description={submission ? `ปีการศึกษา ${yearCode}\nนิสิต ${submission.students.length} คน\n${submission.students.slice(0, 10).map((student) => `${student.name} · ${student.studentCode ?? "ไม่มีรหัสนิสิต"}`).join("\n")}${submission.students.length > 10 ? `\nและอีก ${submission.students.length - 10} คน` : ""}\nงานที่ช่วยเหลือ: ${submission.description}\nให้คนละ 1 ดาวสีเขียว รวม ${submission.students.length} ดาว` : ""} confirmText="ยืนยันและให้คนละ 1 ดาวสีเขียว" onConfirm={confirmAward} />
    </Card>
  );
}
