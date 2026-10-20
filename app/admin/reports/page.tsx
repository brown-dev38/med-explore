import { AnnualReportsPage } from "@/components/annual-reports-page";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";

export const metadata = { title: "รายงานประจำปี | MedExplore Star" };
export default function Page(props: StudentYearPageProps) { return <AnnualReportsPage {...props} area="admin" />; }
