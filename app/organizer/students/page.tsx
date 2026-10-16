import { StudentListPage, type StudentListPageProps } from "@/components/student-dashboard/student-list";

export const metadata = { title: "ข้อมูลนิสิต | MedExplore Star" };

export default function Page(props: StudentListPageProps) {
  return <StudentListPage {...props} area="organizer" />;
}
