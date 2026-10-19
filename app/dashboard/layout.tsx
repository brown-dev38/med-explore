import { Suspense } from "react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard-shell";
import { DashboardUser } from "@/components/dashboard-user";

const studentNav: DashboardNavItem[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: "dashboard", exact: true },
  { href: "/dashboard/upcoming", label: "กิจกรรมที่จะมาถึง", icon: "calendar" },
  { href: "/dashboard/activities", label: "ลงทะเบียนกิจกรรม", icon: "list" },
  {
    href: "/dashboard/my-activities",
    label: "กิจกรรมของฉัน",
    icon: "activities",
  },
  { href: "/dashboard/profile", label: "โปรไฟล์", icon: "profile" },
  { href: "/dashboard/rewards", label: "แลกของรางวัล", icon: "rewards" },
  { href: "/dashboard/redemptions", label: "ประวัติการแลก", icon: "list" },
];

export default function StudentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      brand="MedExplore Star"
      subtitle="นิสิต"
      navItems={studentNav}
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
