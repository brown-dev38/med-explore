import { GreenStarsPage, type GreenStarsPageProps } from "@/components/green-stars-page";

export const metadata = { title: "ดาวสีเขียว / นิสิตช่วยงาน | MedExplore Star" };

export default function Page(props: GreenStarsPageProps) {
  return <GreenStarsPage {...props} area="organizer" />;
}
