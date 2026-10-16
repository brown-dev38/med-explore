"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Candidate = { id: string; name: string; studentCode: string | null };
type Submission = { userId: string; academicYearId: string; description: string; requestId: string; studentName: string };

export function GreenWorkAwardForm({ yearId, yearCode, closed }: { yearId: string; yearCode: string; closed: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [studentId, setStudentId] = useState("");
  const [description, setDescription] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const searchController = useRef<AbortController | null>(null);
  useEffect(() => () => searchController.current?.abort(), []);

  async function searchStudents() {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError("");
    setStudentId("");
    try {
      const response = await fetch(`/api/green-stars/candidates?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "ค้นหานิสิตไม่สำเร็จ");
      if (!controller.signal.aborted) setCandidates(json.data);
    } catch (error) {
      if (!controller.signal.aborted) { setCandidates([]); setSearchError(error instanceof Error ? error.message : "ค้นหานิสิตไม่สำเร็จ"); }
    } finally { if (!controller.signal.aborted) setSearching(false); }
  }

  async function confirmAward() {
    if (!submission || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/green-stars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? "บันทึกดาวสีเขียวไม่สำเร็จ");
      toast.success(`บันทึกงานช่วยเหลือและให้ 1 ดาวสีเขียวแก่ ${submission.studentName} แล้ว`);
      requestId.current = null;
      setDescription("");
      setStudentId("");
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ สามารถลองยืนยันข้อมูลเดิมอีกครั้งได้");
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Award className="size-5 text-emerald-600" />บันทึกงานช่วยเหลือและให้ดาวสีเขียว</CardTitle><CardDescription>ปีการศึกษา {yearCode} · 1 ดาวสีเขียวต่องานที่บันทึก</CardDescription></CardHeader>
      <CardContent>
        {closed ? <p className="text-sm text-muted-foreground">ปีการศึกษานี้ปิดแล้ว ดูประวัติได้ แต่ไม่สามารถเพิ่มดาวได้</p> : (
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const selected = candidates.find((student) => student.id === studentId);
            if (!selected || !description.trim()) return;
            requestId.current ??= crypto.randomUUID();
            setSubmission({ userId: studentId, academicYearId: yearId, description: description.trim(), requestId: requestId.current, studentName: `${selected.name} · ${selected.studentCode ?? "ไม่มีรหัสนิสิต"}` });
          }}>
            <div className="space-y-2"><Label htmlFor="work-student-query">ค้นหานิสิต</Label><div className="flex gap-2"><Input id="work-student-query" value={query} maxLength={100} disabled={busy} placeholder="ชื่อ รหัสนิสิต หรืออีเมล" onChange={(event) => { searchController.current?.abort(); setSearching(false); setQuery(event.target.value); setStudentId(""); setCandidates([]); }} /><Button type="button" variant="outline" disabled={busy || searching} onClick={() => void searchStudents()}><Search className="size-4" />{searching ? "กำลังค้นหา..." : "ค้นหา"}</Button></div></div>
            {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
            <div className="space-y-2"><Label htmlFor="work-student">นิสิตที่ช่วยงาน</Label><select id="work-student" required value={studentId} disabled={busy || searching} onChange={(event) => setStudentId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">{candidates.length ? "เลือกนิสิต" : "ค้นหาเพื่อเลือกนิสิต"}</option>{candidates.map((student) => <option key={student.id} value={student.id}>{student.studentCode ?? "—"} · {student.name}</option>)}</select><p className="text-xs text-muted-foreground">แสดงเฉพาะนิสิตที่เปิดใช้งาน สูงสุด 100 คนต่อการค้นหา</p></div>
            <div className="space-y-2"><Label htmlFor="work-description">งานที่ช่วยเหลือ</Label><textarea id="work-description" required maxLength={1000} rows={3} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="เช่น ช่วยจัดเอกสาร เตรียมห้องประชุม หรือช่วยงานคณะ" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></div>
            <Button type="submit" disabled={busy || !studentId || !description.trim()}>บันทึกงานและให้ 1 ดาวสีเขียว</Button>
          </form>
        )}
      </CardContent>
      <ConfirmDialog open={submission !== null} onOpenChange={(open) => { if (!open && !busy) setSubmission(null); }} loading={busy} title="ยืนยันบันทึกงานช่วยเหลือและให้ดาวสีเขียว" description={submission ? `${submission.studentName}\nปีการศึกษา ${yearCode}\nงานที่ช่วยเหลือ: ${submission.description}\nยืนยันว่านิสิตช่วยงานสำเร็จ และให้ 1 ดาวสีเขียว` : ""} confirmText="ยืนยันและให้ 1 ดาวสีเขียว" onConfirm={confirmAward} />
    </Card>
  );
}
