import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess, requireOrganizerAccess } from "@/lib/dal";
import { hasRole, ROLES } from "@/lib/permissions";
import { toAcademicYearDto } from "@/lib/academic-years";
import { AcademicYearManager } from "@/components/academic-year-manager";

export function AcademicYearsPage({ area }: { area: "admin" | "organizer" }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลดปีการศึกษา...</p>}>
      <AcademicYearsContent area={area} />
    </Suspense>
  );
}

async function AcademicYearsContent({ area }: { area: "admin" | "organizer" }) {
  const user = area === "admin" ? await requireAdminAccess() : await requireOrganizerAccess();
  const years = await prisma.academicYear.findMany({ orderBy: { startsOn: "desc" } });
  return <AcademicYearManager initialYears={years.map(toAcademicYearDto)} canDelete={hasRole(user, ROLES.ADMIN)} />;
}
