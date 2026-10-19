import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudentDashboardContext, type StudentArea } from "@/lib/student-dashboard";
import type { StudentSearchParams } from "@/lib/student-activity-filters";
import { ProfileView } from "@/components/profile-view";
import Overview from "./overview";
import MyActivities from "./my-activities";
import Upcoming from "./upcoming";
import YearActivities from "./year-activities";

export type StaffStudentPageProps = {
  params: Promise<{ id: string; view: string[] }>;
  searchParams: Promise<StudentSearchParams>;
};

export function StaffStudentPage(props: StaffStudentPageProps & { area: StudentArea }) {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลนิสิต...</p>}><StaffStudentContent {...props} /></Suspense>;
}

async function StaffStudentContent({ area, params, searchParams }: StaffStudentPageProps & { area: StudentArea }) {
  const { id, view } = await params;
  const { academicYearId } = await searchParams;
  const yearQuery = typeof academicYearId === "string" ? `?academicYearId=${encodeURIComponent(academicYearId)}` : "";
  const target = { area, id };
  const { user, basePath } = await getStudentDashboardContext(target);
  const section = view.length === 1 && view[0] === "dashboard" ? "overview"
    : view.length === 2 && view[0] === "dashboard" ? view[1] : null;
  if (!section || !["overview", "my-activities", "upcoming", "year-activities", "profile"].includes(section)) notFound();

  const tabs = [
    ["overview", "ภาพรวม", basePath],
    ["my-activities", "กิจกรรมของนิสิต", `${basePath}/my-activities`],
    ["upcoming", "กิจกรรมที่จะมาถึง", `${basePath}/upcoming`],
    ["profile", "โปรไฟล์", `${basePath}/profile`],
  ];
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border bg-muted/40 p-4" aria-label="นิสิตที่กำลังดู">
        <Link href={`/${area}/students`} className="text-sm text-primary underline underline-offset-4">กลับรายชื่อนิสิต</Link>
        <p className="font-semibold">{user.name} · รหัสนิสิต {"studentCode" in user ? user.studentCode ?? "—" : "—"}</p>
        <p className="text-sm text-muted-foreground">กำลังดูข้อมูลนิสิต · อ่านอย่างเดียว</p>
        <nav aria-label="ข้อมูลนิสิต" className="flex flex-wrap gap-4 text-sm">
          {tabs.map(([key, label, href]) => <Link key={key} href={`${href}${yearQuery}`} aria-current={section === key ? "page" : undefined} className={section === key ? "font-semibold text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>{label}</Link>)}
        </nav>
      </section>
      {section === "overview" && <Overview target={target} searchParams={searchParams} />}
      {section === "my-activities" && <MyActivities target={target} searchParams={searchParams} />}
      {section === "upcoming" && <Upcoming target={target} searchParams={searchParams} />}
      {section === "year-activities" && <YearActivities target={target} searchParams={searchParams} />}
      {section === "profile" && <ProfileView target={target} />}
    </div>
  );
}
