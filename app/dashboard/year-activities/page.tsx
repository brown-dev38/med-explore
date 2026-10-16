import YearActivitiesPage from "@/components/student-dashboard/year-activities";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";

export const metadata = { title: "กิจกรรมตามปีการศึกษา | MedExplore Star" };

export default function Page(props: StudentYearPageProps) {
  return <YearActivitiesPage {...props} />;
}
