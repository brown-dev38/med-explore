import Link from "next/link";
import { getStandaloneGreenStarRecords } from "@/lib/green-star-work";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function GreenWorkHistory({ yearId, basePath, query, requestedPage }: { yearId: string; basePath: string; query: string; requestedPage: number }) {
  const { records, total, page, totalPages } = await getStandaloneGreenStarRecords(yearId, query, requestedPage);
  const pageHref = (next: number) => `${basePath}?${new URLSearchParams({ academicYearId: yearId, q: query, page: String(next) })}`;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">ประวัติงานช่วยเหลือทั่วไป</h2>
      <form action={basePath} className="flex items-end gap-3"><input type="hidden" name="academicYearId" value={yearId} /><div className="flex-1 space-y-2"><Label htmlFor="work-history-query">ค้นหานิสิตหรือรายละเอียดงาน</Label><Input id="work-history-query" name="q" defaultValue={query} maxLength={100} /></div><Button type="submit" variant="outline">ค้นหาประวัติ</Button></form>
      <p className="text-sm text-muted-foreground">พบ {total} รายการ · หน้า {page} / {totalPages}</p>
      <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>นิสิต</TableHead><TableHead>งานที่ช่วยเหลือ</TableHead><TableHead>ดาวสีเขียว</TableHead><TableHead>ผู้ให้ดาว</TableHead><TableHead>วันที่บันทึก</TableHead></TableRow></TableHeader><TableBody>
        {records.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">ยังไม่มีประวัติตามเงื่อนไขที่เลือก</TableCell></TableRow>}
        {records.map((record) => <TableRow key={String(record.id)}>
          <TableCell><p className="font-medium">{[record.user.firstname, record.user.lastname].filter(Boolean).join(" ") || record.user.username}</p><p className="text-xs text-muted-foreground">{record.user.studentCode ?? "—"}</p></TableCell>
          <TableCell className="max-w-sm whitespace-pre-wrap break-words">{record.reason ?? "งานช่วยเหลือทั่วไป"}</TableCell>
          <TableCell className="text-emerald-700 dark:text-emerald-400">{record.status === "APPROVED" ? `${record.points} ดาว` : "ยกเลิก / ยังไม่อนุมัติ"}</TableCell>
          <TableCell>{record.approver ? [record.approver.firstname, record.approver.lastname].filter(Boolean).join(" ") || record.approver.username : "—"}</TableCell>
          <TableCell>{formatThaiDateTime(record.createdAt.toISOString())}</TableCell>
        </TableRow>)}
      </TableBody></Table></div>
      <nav aria-label="หน้าประวัติงานช่วยเหลือ" className="flex gap-4 text-sm">{page > 1 && <Link href={pageHref(page - 1)} className="text-primary underline">หน้าก่อนหน้า</Link>}{page < totalPages && <Link href={pageHref(page + 1)} className="text-primary underline">หน้าถัดไป</Link>}</nav>
    </section>
  );
}
