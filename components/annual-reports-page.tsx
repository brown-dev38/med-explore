import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/dal";
import { canExportAnnualReports, hasRole, ROLES } from "@/lib/permissions";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
import { AnnualReports } from "@/components/annual-reports";

export function AnnualReportsPage(props: StudentYearPageProps & { area: "admin" | "organizer" }) {
  return <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-muted-foreground">กำลังโหลดรายงาน...</p>}><ReportsContent {...props} /></Suspense>;
}

async function ReportsContent({ searchParams, area }: StudentYearPageProps & { area: "admin" | "organizer" }) {
  const user = await requireAuth();
  if (!canExportAnnualReports(user) || (area === "admin" && !hasRole(user, ROLES.ADMIN))) redirect("/forbidden");
  const { years, selectedYear } = await getStudentYearContext(searchParams);
  return <AnnualReports years={years} initialYearId={selectedYear?.id ?? ""} />;
}
