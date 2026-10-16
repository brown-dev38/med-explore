import { Suspense } from "react";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStudentViewer, type StudentArea } from "@/lib/student-dashboard";
import { ROLES } from "@/lib/permissions";
import type { StudentSearchParams } from "@/lib/student-activity-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StudentListPageProps = { searchParams: Promise<StudentSearchParams> };
const PAGE_SIZE = 20;

export function StudentListPage(props: StudentListPageProps & { area: StudentArea }) {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลดรายชื่อนิสิต...</p>}><StudentListContent {...props} /></Suspense>;
}

async function StudentListContent({ area, searchParams }: StudentListPageProps & { area: StudentArea }) {
  await requireStudentViewer(area);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const requestedPage = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const where: Prisma.UserWhereInput = {
    userRoles: { some: { role: { name: ROLES.STUDENT } } },
    ...(query ? { OR: ["studentCode", "firstname", "lastname", "username"].map((field) => ({ [field]: { contains: query } })) } : {}),
  };
  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const students = await prisma.user.findMany({
    where, select: { id: true, firstname: true, lastname: true, username: true, studentCode: true, isActive: true },
    orderBy: [{ studentCode: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
  });
  const pageHref = (nextPage: number) => `/${area}/students?${new URLSearchParams({ q: query, page: String(nextPage) })}`;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">ข้อมูลนิสิต</h1><p className="mt-1 text-sm text-muted-foreground">เลือกนิสิตเพื่อดูภาพรวม ประวัติกิจกรรม ดาวสะสม และโปรไฟล์</p></div>
      <form action={`/${area}/students`} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-2"><Label htmlFor="student-search">ค้นหาชื่อ รหัสนิสิต หรือชื่อผู้ใช้</Label><Input id="student-search" name="q" defaultValue={query} maxLength={100} /></div>
        <Button type="submit">ค้นหา</Button>
      </form>
      <p className="text-sm text-muted-foreground">พบ {total} คน · หน้า {page} / {totalPages}</p>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader><TableRow><TableHead>รหัสนิสิต</TableHead><TableHead>ชื่อ-นามสกุล</TableHead><TableHead>สถานะบัญชี</TableHead><TableHead>ข้อมูล</TableHead></TableRow></TableHeader>
          <TableBody>
            {students.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">ไม่พบนิสิตตามเงื่อนไข</TableCell></TableRow>}
            {students.map((student) => <TableRow key={String(student.id)}>
              <TableCell>{student.studentCode ?? "—"}</TableCell>
              <TableCell>{[student.firstname, student.lastname].filter(Boolean).join(" ") || student.username}</TableCell>
              <TableCell>{student.isActive ? "ใช้งานปกติ" : "ปิดใช้งาน"}</TableCell>
              <TableCell><Link href={`/${area}/students/${student.id}/dashboard`} className="font-medium text-primary underline underline-offset-4">ดูข้อมูลนิสิต<span className="sr-only"> {student.studentCode ?? student.username}</span></Link></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <nav aria-label="หน้ารายชื่อนิสิต" className="flex gap-4 text-sm">
        {page > 1 && <Link href={pageHref(page - 1)} className="text-primary underline">หน้าก่อนหน้า</Link>}
        {page < totalPages && <Link href={pageHref(page + 1)} className="text-primary underline">หน้าถัดไป</Link>}
      </nav>
    </div>
  );
}
