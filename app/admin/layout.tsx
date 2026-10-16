import { Suspense } from "react";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard-shell";
import { DashboardUser } from "@/components/dashboard-user";

const adminNav: DashboardNavItem[] = [
  { href: "/admin", label: "ภาพรวม", icon: "dashboard", exact: true },
  { href: "/admin/academic-years", label: "ปีการศึกษา", icon: "calendar" },
  { href: "/admin/users", label: "ผู้ใช้งาน", icon: "users" },
  { href: "/admin/students", label: "ข้อมูลนิสิต", icon: "users" },
  { href: "/admin/activities", label: "กิจกรรม", icon: "activities" },
  { href: "/admin/green-stars", label: "ดาวสีเขียว / นิสิตช่วยงาน", icon: "list" },
  { href: "/admin/profile", label: "โปรไฟล์", icon: "profile" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      brand="MedExplore Star"
      subtitle="ผู้ดูแลระบบ"
      navItems={adminNav}
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
