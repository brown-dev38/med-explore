import StudentDashboardPage from "@/components/student-dashboard/overview";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";

export const metadata = {
  title: "ภาพรวมของฉัน | MedExplore Star",
};

export default function Page(props: StudentYearPageProps) {
  return <StudentDashboardPage {...props} />;
}
