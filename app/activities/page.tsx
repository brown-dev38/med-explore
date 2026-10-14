import { redirect } from "next/navigation";

export default function ActivitiesRedirectPage() {
  redirect("/dashboard/activities");
}
