"use client";

import { useEffect, useId, useState } from "react";
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AnnualReport } from "@/lib/annual-report";
import { ANNUAL_REPORTS, ACTIVITY_REPORT_STATUSES, STAR_REPORT_TYPES, REDEMPTION_REPORT_STATUSES,
  type AnnualReportFilters, type AnnualReportKind, type ReportSheet } from "@/lib/annual-report-options";
import type { StudentYearOption } from "@/lib/student-activity-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Preview = Omit<AnnualReport, "sheets"> & { sheets: (ReportSheet & { rowCount: number })[] };
const yearLabels = { DRAFT: "ฉบับร่าง", ACTIVE: "กำลังใช้งาน", CLOSED: "ปิดแล้ว" };
const selectClass = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50";

export function AnnualReports({ years, initialYearId }: { years: StudentYearOption[]; initialYearId: string }) {
  const id = useId();
  const [filters, setFilters] = useState<AnnualReportFilters>({ academicYearId: initialYearId, report: "all", activityStatus: "all", starType: "all", redemptionStatus: "all" });
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Preview; error?: string } | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("overview");
  const [downloading, setDownloading] = useState(false);
  const query = new URLSearchParams(filters).toString();
  const requestKey = `${query}#${reload}`;
  const preview = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;
  const loading = Boolean(filters.academicYearId && result?.key !== requestKey);
  const year = years.find((option) => option.id === filters.academicYearId);
  const sheet = preview?.sheets.find((item) => item.id === selectedSheet) ?? preview?.sheets[0];

  useEffect(() => {
    if (!filters.academicYearId) return;
    const controller = new AbortController();
    (async () => {
      const response = await fetch(`/api/reports/annual?${query}`, { cache: "no-store", signal: controller.signal });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? "โหลดตัวอย่างรายงานไม่สำเร็จ");
      if (!controller.signal.aborted) setResult({ key: requestKey, data: json.data });
    })().catch((failure) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, error: failure instanceof Error ? failure.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" });
    });
    return () => controller.abort();
  }, [filters.academicYearId, query, requestKey]);

  async function download() {
    if (!preview || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/reports/annual?${query}`, { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message ?? "ส่งออกรายงานไม่สำเร็จ");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `annual-report-${year?.code ?? filters.academicYearId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("เตรียมไฟล์รายงาน Excel เรียบร้อยแล้ว");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "ส่งออกรายงานไม่สำเร็จ");
    } finally { setDownloading(false); }
  }

  const additionalFilter = ["activities", "attendance"].includes(filters.report)
    ? { key: "activityStatus" as const, label: "สถานะกิจกรรม", options: ACTIVITY_REPORT_STATUSES }
    : filters.report === "stars" ? { key: "starType" as const, label: "ประเภทดาว", options: STAR_REPORT_TYPES }
    : filters.report === "redemptions" ? { key: "redemptionStatus" as const, label: "สถานะคำขอ", options: REDEMPTION_REPORT_STATUSES } : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><FileSpreadsheet className="size-6 text-primary" aria-hidden="true" />รายงานประจำปี</h1>
          <p className="text-sm text-muted-foreground">ดูภาพรวม ตรวจสอบรายละเอียด และส่งออก Excel ตามปีการศึกษา</p>
        </div>
        <Button onClick={() => void download()} disabled={!preview || downloading || loading} className="w-full sm:w-auto">
          {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          {downloading ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel"}
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${id}-year`}>ปีการศึกษา</Label>
              <select id={`${id}-year`} className={selectClass} value={filters.academicYearId} disabled={downloading || years.length === 0}
                onChange={(event) => setFilters({ ...filters, academicYearId: event.target.value })}>
                {years.length === 0 && <option value="">ยังไม่มีปีการศึกษา</option>}
                {years.map((option) => <option key={option.id} value={option.id}>{option.code} · {yearLabels[option.status]}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-report`}>ประเภทรายงาน</Label>
              <select id={`${id}-report`} className={selectClass} value={filters.report} disabled={downloading || years.length === 0}
                onChange={(event) => setFilters({ ...filters, report: event.target.value as AnnualReportKind, activityStatus: "all", starType: "all", redemptionStatus: "all" })}>
                {ANNUAL_REPORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            {additionalFilter && <div className="space-y-2">
              <Label htmlFor={`${id}-filter`}>{additionalFilter.label}</Label>
              <select id={`${id}-filter`} className={selectClass} value={filters[additionalFilter.key]} disabled={downloading}
                onChange={(event) => setFilters({ ...filters, [additionalFilter.key]: event.target.value })}>
                <option value="all">ทั้งหมด</option>
                {Object.entries(additionalFilter.options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-2xl text-xs text-muted-foreground">เลือก “รายงานทั้งหมด” เพื่อรับครบ 7 ชีต หรือเลือกเฉพาะรายงาน โดยทุกไฟล์มีชีตภาพรวมทั้งปีประกอบ</p>
            <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)} disabled={loading || downloading || !year}>
              <RefreshCw className="size-3.5" aria-hidden="true" />โหลดตัวอย่างล่าสุด
            </Button>
          </div>
        </CardContent>
      </Card>

      {!year && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">รายงานจะแสดงเมื่อมีปีการศึกษาในระบบ</CardContent></Card>}
      {loading && <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />กำลังสรุปข้อมูลรายงาน...</div>}
      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      {preview && <>
        <section className="space-y-4" aria-label="ภาพรวมทั้งปีการศึกษา">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">ภาพรวมปีการศึกษา {preview.year.code}</h2>
            <Badge variant="secondary">{yearLabels[preview.year.status]}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["กิจกรรมทั้งหมด", preview.summary.activities, "กิจกรรม"],
              ["ลงทะเบียนทั้งหมด", preview.summary.registrations, "คนครั้ง"],
              ["ผู้เช็คอินไม่ซ้ำ", preview.summary.uniqueAttendees, "คน"],
              ["บันทึกเวลาเข้า–ออกเดิม", preview.summary.completedCount, "คนครั้ง"],
              ["เช็คอินผ่านประเมิน", preview.summary.qualifiedCount, "คนครั้ง"],
              ["เวลาจากบันทึกเดิมรวม", preview.summary.minutes, "นาที"],
              ["ดาวเพิ่มที่อนุมัติทั้งหมด", preview.summary.earned, "ดาว"],
              ["ยอดดาวตามบัญชีประวัติ", preview.summary.balance, "ดาว"],
            ].map(([label, value, unit]) => <Card key={String(label)}><CardContent className="space-y-2 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{Number(value).toLocaleString("th-TH")} <span className="text-xs font-normal text-muted-foreground">{unit}</span></p></CardContent></Card>)}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex gap-2"><dt className="text-muted-foreground">ดาวใช้แลกรางวัลแล้ว</dt><dd className="font-semibold tabular-nums">{preview.summary.spent.toLocaleString("th-TH")}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">ดาวกันไว้สำหรับคำขอ</dt><dd className="font-semibold tabular-nums">{preview.summary.reserved.toLocaleString("th-TH")}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground">ดาวใช้แลกได้ขณะนี้</dt><dd className="font-semibold tabular-nums">{preview.summary.available.toLocaleString("th-TH")}{preview.year.status === "CLOSED" && " · ปีปิดแล้ว"}</dd></div>
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            ยอดภาพรวมครอบคลุมทั้งปี ทุกสถานะ · ตัวกรองใช้กับรายละเอียดที่เลือก · ข้อมูล ณ {new Date(preview.generatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} (เวลาประเทศไทย)
            <br />ไฟล์ดาวน์โหลดจะดึงข้อมูลล่าสุดอีกครั้ง โปรดเก็บไฟล์ฉบับสรุปไว้หลังปิดปี
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>ตัวอย่างข้อมูลในไฟล์</CardTitle>
            <CardDescription>แสดงสูงสุด 10 แถวต่อชีต ไฟล์ Excel มีข้อมูลครบตามตัวกรอง พร้อมรหัสรายงานและผู้ส่งออก</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกชีตรายงาน">
              {preview.sheets.map((item) => <Button key={item.id} variant={item.id === sheet?.id ? "default" : "outline"} size="sm" aria-pressed={item.id === sheet?.id} onClick={() => setSelectedSheet(item.id)}>
                {item.name} ({item.rowCount.toLocaleString("th-TH")})
              </Button>)}
            </div>
            {sheet?.id === "students" && <p className="text-sm text-muted-foreground">จัดอันดับจากดาวเหลืองและดาวเขียวที่ได้รับอนุมัติรวมในปีที่เลือก เรียงจากมากไปน้อย คะแนนเท่ากันใช้อันดับร่วม โดยไม่หักดาวที่ใช้แลกรางวัลและไม่รวมรายการปรับยอด</p>}
            {sheet && <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader><TableRow>{sheet.columns.map((column) => <TableHead key={column} className="whitespace-nowrap">{column}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {sheet.rows.length === 0 && <TableRow><TableCell colSpan={sheet.columns.length} className="h-24 text-center text-muted-foreground">ไม่พบรายการตามเงื่อนไขในปีนี้</TableCell></TableRow>}
                  {sheet.rows.map((row, index) => <TableRow key={index}>{row.map((cell, column) => <TableCell key={column} className="max-w-96 min-w-28 whitespace-normal break-words align-top">{cell === null || cell === "" ? "—" : typeof cell === "number" ? cell.toLocaleString("th-TH") : cell}</TableCell>)}</TableRow>)}
                </TableBody>
              </Table>
            </div>}
          </CardContent>
        </Card>
      </>}
      <p className="text-xs leading-relaxed text-muted-foreground">รายงานรายบุคคลแสดงเฉพาะผู้ที่มีรายการในปีที่เลือก ระบบยังไม่มีทะเบียนนิสิตแยกตามปี จึงไม่ใช้ระบุผู้ที่ไม่เข้าร่วมเลยทั้งปี</p>
    </div>
  );
}
