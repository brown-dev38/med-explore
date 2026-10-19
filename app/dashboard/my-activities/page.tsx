import MyActivitiesPage from "@/components/student-dashboard/my-activities";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";

export const metadata = {
  title: "กิจกรรมของฉัน | MedExplore Star",
};

export default function Page(props: StudentYearPageProps) {
  return <MyActivitiesPage {...props} />;
}
