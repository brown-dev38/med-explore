import Link from "next/link";
import type { TransactionStatus } from "@prisma/client";
import { getStandaloneGreenStarRecords, GREEN_WORK_PAGE_SIZES } from "@/lib/green-star-work";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusLabels = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
} satisfies Record<TransactionStatus, string>;

export async function GreenWorkHistory({ yearId, yearCode, basePath, query, requestedPage, requestedPageSize }: { yearId: string; yearCode: string; basePath: string; query: string; requestedPage: number; requestedPageSize?: number }) {
  const { records, total, page, totalPages, pageSize } = await getStandaloneGreenStarRecords(yearId, query, requestedPage, requestedPageSize);
  const pageHref = (next: number) => `${basePath}?${new URLSearchParams({ academicYearId: yearId, q: query, page: String(next), pageSize: String(pageSize) })}`;
  const firstRecord = records.length ? (page - 1) * pageSize + 1 : 0;
  const lastRecord = records.length ? (page - 1) * pageSize + records.length : 0;
  const visiblePages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);
  const pageLinkClass = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm hover:bg-muted";
  return (
    <section aria-labelledby="work-history-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div>
        <h2 id="work-history-title" className="text-lg font-semibold">ประวัติงานช่วยเหลือทั่วไป</h2>
        <p className="mt-1 text-sm text-muted-foreground">ปีการศึกษา {yearCode} · แสดงรายการล่าสุดก่อน</p>
      </div>
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="academicYearId" value={yearId} />
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="min-w-0 basis-full space-y-2 sm:flex-1 sm:basis-auto">
          <Label htmlFor="work-history-query">ค้นหานิสิตหรือรายละเอียดงาน</Label>
          <Input key={`${yearId}:${query}`} id="work-history-query" name="q" defaultValue={query} maxLength={100} placeholder="รหัสนิสิต ชื่อ หรือรายละเอียดงาน" />
        </div>
        <Button type="submit" variant="outline">ค้นหาประวัติ</Button>
        {query && <Link href={`${basePath}?${new URLSearchParams({ academicYearId: yearId, pageSize: String(pageSize) })}`} className="inline-flex h-9 items-center text-sm text-primary underline underline-offset-4">ล้างการค้นหา</Link>}
      </form>
      <div className="overflow-hidden rounded-xl border"><Table aria-labelledby="work-history-title"><TableHeader><TableRow><TableHead scope="col">รหัสนิสิต</TableHead><TableHead scope="col">ชื่อ–นามสกุล</TableHead><TableHead scope="col">งานที่ช่วยเหลือ</TableHead><TableHead scope="col">ดาวสีเขียว</TableHead><TableHead scope="col">สถานะ</TableHead><TableHead scope="col">ผู้ให้ดาว</TableHead><TableHead scope="col">วันที่บันทึก</TableHead></TableRow></TableHeader><TableBody>
        {records.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{query ? "ไม่พบประวัติที่ตรงกับคำค้นหา" : "ยังไม่มีประวัติงานช่วยเหลือทั่วไปในปีการศึกษานี้"}</TableCell></TableRow>}
        {records.map((record) => <TableRow key={String(record.id)}>
          <TableCell className="font-mono">{record.user.studentCode ?? "—"}</TableCell>
          <TableCell className="font-medium">{[record.user.firstname, record.user.lastname].filter(Boolean).join(" ") || record.user.username}</TableCell>
          <TableCell className="min-w-48 max-w-sm whitespace-pre-wrap break-words">{record.reason ?? "งานช่วยเหลือทั่วไป"}</TableCell>
          <TableCell className={record.status === "APPROVED" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>{record.status === "APPROVED" ? `${record.points} ดาว` : "—"}</TableCell>
          <TableCell>{statusLabels[record.status]}</TableCell>
          <TableCell>{record.approver ? [record.approver.firstname, record.approver.lastname].filter(Boolean).join(" ") || record.approver.username : "—"}</TableCell>
          <TableCell>{formatThaiDateTime(record.createdAt.toISOString())}</TableCell>
        </TableRow>)}
      </TableBody></Table></div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">แสดง {firstRecord}–{lastRecord} จาก {total} รายการ · หน้านี้ {records.length} รายการ</p>
        <form action={basePath} method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="academicYearId" value={yearId} />
          <input type="hidden" name="q" value={query} />
          <Label htmlFor="work-history-page-size">รายการต่อหน้า</Label>
          <select key={pageSize} id="work-history-page-size" name="pageSize" defaultValue={pageSize} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            {GREEN_WORK_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <Button type="submit" variant="outline" size="sm">แสดง</Button>
        </form>
      </div>
      <nav aria-label="หน้าประวัติงานช่วยเหลือ" className="flex flex-wrap items-center gap-2">
        {page > 1
          ? <Link href={pageHref(page - 1)} className={pageLinkClass}>ก่อนหน้า</Link>
          : <span aria-disabled="true" className={`${pageLinkClass} cursor-default opacity-50`}>ก่อนหน้า</span>}
        {visiblePages.map((number, index) => <span key={number} className="inline-flex items-center gap-2">
          {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}
          <Link href={pageHref(number)} aria-label={`หน้า ${number}`} aria-current={number === page ? "page" : undefined} className={`${pageLinkClass} ${number === page ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}>{number}</Link>
        </span>)}
        {page < totalPages
          ? <Link href={pageHref(page + 1)} className={pageLinkClass}>ถัดไป</Link>
          : <span aria-disabled="true" className={`${pageLinkClass} cursor-default opacity-50`}>ถัดไป</span>}
        <span className="text-sm text-muted-foreground">หน้า {page} / {totalPages}</span>
      </nav>
    </section>
  );
}
