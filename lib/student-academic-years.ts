import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { selectStudentYear, type StudentSearchParams, type StudentYearOption } from "@/lib/student-activity-filters";

export async function getStudentYearContext(params: Promise<StudentSearchParams>) {
  const searchParams = await params;
  if (Array.isArray(searchParams.academicYearId)) notFound();
  const records = await prisma.academicYear.findMany({
    orderBy: [{ startsOn: "desc" }, { id: "desc" }],
    select: { id: true, code: true, status: true },
  });
  const years: StudentYearOption[] = records.map((year) => ({ ...year, id: String(year.id) }));
  const selectedYear = selectStudentYear(years, searchParams.academicYearId);
  if (searchParams.academicYearId && !selectedYear) notFound();
  return { years, selectedYear, searchParams };
}
