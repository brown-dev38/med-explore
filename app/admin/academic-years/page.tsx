import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { PERMISSIONS } from "@/lib/permissions";
import { toAcademicYearDto } from "@/lib/academic-years";
import { AcademicYearManager } from "./academic-year-manager";

export const metadata = {
  title: "ปีการศึกษา | MedExplore Star",
};

export default function AcademicYearsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <AcademicYearsContent />
    </Suspense>
  );
}

async function AcademicYearsContent() {
  await requirePermission(PERMISSIONS.ACADEMIC_YEAR_MANAGE);

  const years = await prisma.academicYear.findMany({
    orderBy: { startsOn: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          จัดการปีการศึกษา
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          มีปีการศึกษาที่เปิดใช้งาน (ACTIVE) ได้พร้อมกันเพียงปีเดียว
        </p>
      </div>
      <AcademicYearManager initialYears={years.map(toAcademicYearDto)} />
    </div>
  );
}
