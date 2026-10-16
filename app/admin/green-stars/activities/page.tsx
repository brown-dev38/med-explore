import { GreenStarsPage, type GreenStarsPageProps } from "@/components/green-stars-page";

export const metadata = { title: "ดาวสีเขียวจากกิจกรรม | MedExplore Star" };

export default function Page(props: GreenStarsPageProps) {
  return <GreenStarsPage {...props} area="admin" activityMode />;
}
