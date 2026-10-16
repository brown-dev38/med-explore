import UpcomingActivitiesPage from "@/components/student-dashboard/upcoming";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";

export const metadata = {
  title: "กิจกรรมที่จะมาถึง | MedExplore Star",
};

export default function Page(props: StudentYearPageProps) {
  return <UpcomingActivitiesPage {...props} />;
}
