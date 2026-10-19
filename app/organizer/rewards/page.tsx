import { RewardsPage } from "@/components/rewards-pages";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
export const metadata = { title: "จัดการของรางวัล | MedExplore Star" };
export default function Page(props: StudentYearPageProps) { return <RewardsPage {...props} area="organizer" />; }
