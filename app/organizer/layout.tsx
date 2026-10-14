import { Suspense } from "react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard-shell";
import { DashboardUser } from "@/components/dashboard-user";

const organizerNav: DashboardNavItem[] = [
  {
    href: "/organizer/activities",
    label: "กิจกรรมที่จัด",
    icon: "activities",
    exact: true,
  },
  { href: "/organizer/profile", label: "โปรไฟล์", icon: "profile" },
];

export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      brand="MedExplore Star"
      subtitle="ผู้จัดกิจกรรม"
      navItems={organizerNav}
      userSlot={
        <Suspense
          fallback={
            <div className="h-16 animate-pulse rounded-lg bg-slate-200 dark:bg-neutral-800" />
          }
        >
          <DashboardUser />
        </Suspense>
      }
    >
      {children}
    </DashboardShell>
  );
}
