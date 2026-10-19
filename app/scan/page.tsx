import { Suspense } from "react";
import { requireAuth } from "@/lib/dal";
import Link from "next/link";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
import { ScanClient } from "./scan-client";

export const metadata = {
  title: "สแกน QR | MedExplore Star",
};

export default function ScanPage(props: StudentYearPageProps) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-8 sm:p-6">
      <Suspense
        fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}
      >
        <ScanContent {...props} />
      </Suspense>
    </main>
  );
}

async function ScanContent({ searchParams }: StudentYearPageProps) {
  await requireAuth();
  const { selectedYear } = await getStudentYearContext(searchParams);
  if (!selectedYear || selectedYear.status !== "ACTIVE") {
    return <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">ไม่สามารถสแกนบันทึกเวลาได้</h1>
      <p role="status" className="text-sm text-muted-foreground">{selectedYear?.status === "CLOSED" ? `ปีการศึกษา ${selectedYear.code} ปิดแล้ว ไม่สามารถเช็คอินหรือเช็คเอาท์ได้` : "ปีการศึกษานี้ยังไม่เปิดใช้งาน ไม่สามารถเช็คอินหรือเช็คเอาท์ได้"}</p>
      <Link href={selectedYear ? `/dashboard?academicYearId=${selectedYear.id}` : "/dashboard"} className="inline-block rounded-md px-3 py-2 text-sm font-medium text-primary underline">กลับหน้าภาพรวม</Link>
    </section>;
  }
  return <ScanClient academicYearId={selectedYear.id} academicYearCode={selectedYear.code} />;
}
