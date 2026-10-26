"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MAX_STUDENT_IMPORT_BYTES, type GreenStarImportInput, type GreenStarImportTarget, type StudentImportRow } from "@/lib/green-star-import-schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function GreenStarExcelImport({ target, targetLabel, disabled = false, onImported }: {
  target: GreenStarImportTarget;
  targetLabel: string;
  disabled?: boolean;
  onImported?: () => Promise<void>;
}) {
  const id = useId();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<StudentImportRow[] | null>(null);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submission, setSubmission] = useState<GreenStarImportInput | null>(null);
  const busy = pending !== null;
  const ready = rows?.filter((row) => row.status === "ready") ?? [];
  const work = target.mode === "work";

  async function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || inFlight.current || disabled) return;
    setError(""); setMessage(""); setRows(null);
    if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > MAX_STUDENT_IMPORT_BYTES) {
      setError("กรุณาเลือกไฟล์ Excel .xlsx ที่ไม่ว่างและมีขนาดไม่เกิน 5 MB");
      return;
    }
    inFlight.current = true; setPending("preview");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", target.mode);
      form.set("academicYearId", target.academicYearId);
      if (target.mode === "activity") form.set("activityId", target.activityId);
      const response = await fetch("/api/green-stars/import", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "ตรวจสอบไฟล์ไม่สำเร็จ");
      setRows(result.data.rows);
      requestId.current ??= crypto.randomUUID();
    } catch (error) { setError(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { inFlight.current = false; setPending(null); }
  }

  async function confirm() {
    if (!submission || inFlight.current || disabled) return false;
    inFlight.current = true; setPending("import"); setError("");
    try {
      const response = await fetch("/api/green-stars/import", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "นำเข้าไม่สำเร็จ สามารถลองยืนยันข้อมูลเดิมอีกครั้งได้");
      const count = result.data.imported;
      const success = work ? `นำเข้าสำเร็จ ${count} คน และให้คนละ 1 ดาวสีเขียวแล้ว` : `เพิ่มนิสิตช่วยงาน ${count} คนแล้ว รอยืนยันการช่วยงานเพื่อให้ดาวสีเขียว`;
      setMessage(success); toast.success(success);
      setRows(null); setFile(null); setDescription(""); requestId.current = null;
      if (fileInput.current) fileInput.current.value = "";
      if (onImported) {
        try { await onImported(); } catch { toast.warning("บันทึกแล้ว แต่โหลดรายชื่อล่าสุดไม่สำเร็จ กรุณารีเฟรช"); }
      }
      router.refresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ สามารถลองยืนยันข้อมูลเดิมอีกครั้งได้";
      setError(message); toast.error(message);
      return false;
    } finally { inFlight.current = false; setPending(null); }
  }

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="size-5" />นำเข้ารายชื่อจาก Excel</CardTitle>
      <CardDescription>{targetLabel} · {work ? "ให้คนละ 1 ดาวสีเขียวสำหรับงานเดียวกัน" : "เพิ่มรายชื่อนิสิตช่วยงานเพื่อรอยืนยัน"}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4" aria-busy={busy}>
      {disabled ? <p className="text-sm text-muted-foreground">ขณะนี้ไม่สามารถนำเข้ารายชื่อได้</p> : <>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">ใช้ไฟล์ .xlsx โดยคอลัมน์ A ของชีตแรกเป็นรหัสนักศึกษา มีหรือไม่มีหัวคอลัมน์ก็ได้ คอลัมน์อื่นจะไม่ถูกนำเข้า สูงสุด 500 รายชื่อ ขนาดไม่เกิน 5 MB แนะนำให้เก็บรหัสเป็นข้อความเพื่อรักษาเลขศูนย์ด้านหน้า</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={preview}>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`${id}-file`}>ไฟล์รายชื่อนักศึกษา</Label>
            <input ref={fileInput} id={`${id}-file`} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={busy} aria-describedby={`${id}-hint`} className="block w-full rounded-lg border border-input p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1" onChange={(event) => {
              setFile(event.target.files?.[0] ?? null); setRows(null); setError(""); setMessage(""); requestId.current = null;
            }} />
          </div>
          <Button type="submit" variant="outline" disabled={busy || !file}>{pending === "preview" && <Loader2 className="size-4 animate-spin" />}{pending === "preview" ? "กำลังตรวจสอบ..." : "ตรวจสอบไฟล์"}</Button>
        </form>
        {rows && <>
          <p role="status" className="text-sm font-medium">พร้อมนำเข้า {ready.length} คน · ข้าม {rows.length - ready.length} แถว</p>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table><TableHeader><TableRow><TableHead>แถวใน Excel</TableHead><TableHead>รหัสนักศึกษา</TableHead><TableHead>ชื่อ–นามสกุล</TableHead><TableHead>ผลตรวจสอบ</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.row}><TableCell>{row.row}</TableCell><TableCell className="font-mono">{row.studentCode || "—"}</TableCell><TableCell>{row.name ?? "—"}</TableCell><TableCell className={row.status === "ready" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{row.message}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
          <div className="space-y-2"><Label htmlFor={`${id}-description`}>งานที่ช่วยเหลือ{!work && " (ไม่บังคับ)"}</Label><textarea id={`${id}-description`} rows={3} maxLength={1000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="ระบุงานเดียวกันสำหรับรายชื่อที่นำเข้าทั้งหมด" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></div>
          <Button type="button" disabled={busy || ready.length === 0 || (work && !description.trim())} onClick={() => {
            if (!requestId.current) return;
            setSubmission({ target, studentCodes: ready.map((row) => row.studentCode), description: description.trim(), requestId: requestId.current });
          }}>{work ? `นำเข้าและให้ดาวสีเขียว ${ready.length} คน` : `นำเข้านิสิตช่วยงาน ${ready.length} คน`}</Button>
        </>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      <ConfirmDialog open={submission !== null} onOpenChange={(open) => { if (!open && !busy) setSubmission(null); }} loading={busy}
        title={work ? "ยืนยันนำเข้าและให้ดาวสีเขียว" : "ยืนยันนำเข้านิสิตช่วยงาน"}
        description={submission ? `${targetLabel}\nนำเข้าเฉพาะรายชื่อที่ผ่านการตรวจสอบ ${submission.studentCodes.length} คน\n${submission.description ? `งานที่ช่วยเหลือ: ${submission.description}\n` : ""}${work ? "ให้คนละ 1 ดาวสีเขียว" : "เพิ่มรายชื่อเป็นรอยืนยันการช่วยงาน ยังไม่ให้ดาวสีเขียว"}` : ""}
        confirmText={work ? "ยืนยันและให้ดาวสีเขียว" : "ยืนยันนำเข้ารายชื่อ"} onConfirm={confirm} />
    </CardContent>
  </Card>;
}
