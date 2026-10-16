import { Suspense } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  CalendarDays,
  ArrowUpRight,
  Shield,
  User,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/dal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "ภาพรวมผู้ดูแลระบบ | MedExplore Star",
};

export default function AdminHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          กำลังโหลดข้อมูล...
        </div>
      }
    >
      <AdminHomeContent />
    </Suspense>
  );
}

async function AdminHomeContent() {
  const user = await requireAdminAccess();

  const [
    userCount,
    activeUserCount,
    academicYearCount,
    activeYear,
    activityCount,
    publishedCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.academicYear.count(),
    prisma.academicYear.findFirst({ where: { status: "ACTIVE" } }),
    prisma.activity.count(),
    prisma.activity.count({ where: { status: "PUBLISHED" } }),
  ]);

  const stats = [
    {
      label: "ผู้ใช้งานทั้งหมด",
      value: userCount,
      hint: `ใช้งานอยู่ ${activeUserCount} บัญชี`,
      href: "/admin/users",
      icon: Users,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
    {
      label: "ปีการศึกษา",
      value: academicYearCount,
      hint: activeYear
        ? `ปีที่ใช้งาน: ${activeYear.code}`
        : "ยังไม่มีปีที่เปิดใช้งาน",
      href: "/admin/academic-years",
      icon: Calendar,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "กิจกรรมทั้งหมด",
      value: activityCount,
      hint: `เปิดรับลงทะเบียน ${publishedCount} กิจกรรม`,
      href: "/admin/activities",
      icon: CalendarDays,
      color: "text-sky-500",
      bg: "bg-sky-500/10",
    },
  ];

  const shortcuts = [
    {
      href: "/admin/green-stars",
      title: "ดาวสีเขียว / นิสิตช่วยงาน",
      description: "มอบหมายผู้ช่วยงานและยืนยันให้ดาวสีเขียว",
      icon: Users,
    },
    {
      href: "/admin/academic-years",
      title: "จัดการปีการศึกษา",
      description: "สร้าง เปิดใช้งาน และปิดรอบปีการศึกษาสำหรับการสะสมดาว",
      icon: Calendar,
    },
    {
      href: "/admin/users",
      title: "จัดการผู้ใช้งาน",
      description: "ค้นหา แก้ไขโปรไฟล์ มอบหมายบทบาท และระงับบัญชีผู้ใช้",
      icon: Users,
    },
    {
      href: "/admin/activities",
      title: "จัดการกิจกรรม",
      description: "สร้างกิจกรรม เปิดรับลงทะเบียน สร้าง QR และบันทึกเวลาเข้างาน",
      icon: CalendarDays,
    },
    {
      href: "/admin/profile",
      title: "โปรไฟล์ของฉัน",
      description: "ตรวจสอบข้อมูลบัญชีและบทบาทผู้ดูแลระบบของคุณ",
      icon: User,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Shield className="h-3 w-3 text-indigo-500" />
            ผู้ดูแลระบบ
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          ภาพรวมผู้ดูแลระบบ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ยินดีต้อนรับคุณ {user.name ?? "ผู้ดูแล"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="group">
              <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </span>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tracking-tight text-foreground">
                    {stat.value}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.hint}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">
          เมนูการจัดการหลัก
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="group">
                <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <CardTitle className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </CardTitle>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs leading-relaxed">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
