import { RedemptionsPage } from "@/components/rewards-pages";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
export const metadata = { title: "พิจารณาคำขอแลกรางวัล | MedExplore Star" };
export default function Page(props: StudentYearPageProps) { return <RedemptionsPage {...props} area="admin" />; }
