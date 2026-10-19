import { RewardsPage } from "@/components/rewards-pages";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
export const metadata = { title: "แลกของรางวัล | MedExplore Star" };
export default function Page(props: StudentYearPageProps) { return <RewardsPage {...props} area="dashboard" />; }
