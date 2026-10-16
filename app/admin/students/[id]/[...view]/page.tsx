import { StaffStudentPage, type StaffStudentPageProps } from "@/components/student-dashboard/staff-view";

export const metadata = { title: "ดูข้อมูลนิสิต | MedExplore Star" };

export default function Page(props: StaffStudentPageProps) {
  return <StaffStudentPage {...props} area="admin" />;
}
