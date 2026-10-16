import { Suspense } from "react";
import Link from "next/link";
import { Calendar, CalendarDays, Users, User, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrganizerAccess } from "@/lib/dal";
import { ROLES } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "ภาพรวมผู้จัดกิจกรรม | MedExplore Star" };

export default function OrganizerHomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลดภาพรวม...</p>}>
      <OrganizerHomeContent />
    </Suspense>
  );
}

async function OrganizerHomeContent() {
  const user = await requireOrganizerAccess();
  const [studentCount, yearCount, activeYear, activityCount, publishedCount] = await Promise.all([
    prisma.user.count({ where: { userRoles: { some: { role: { name: ROLES.STUDENT } } } } }),
    prisma.academicYear.count(),
    prisma.academicYear.findFirst({ where: { status: "ACTIVE" }, select: { code: true } }),
    prisma.activity.count(),
    prisma.activity.count({ where: { status: "PUBLISHED" } }),
  ]);
  const stats = [
    { label: "นิสิตทั้งหมด", value: studentCount, hint: "ดูข้อมูลและประวัติกิจกรรมของนิสิต", href: "/organizer/students", icon: Users },
    { label: "ปีการศึกษา", value: yearCount, hint: activeYear ? `ปีที่ใช้งาน: ${activeYear.code}` : "ยังไม่มีปีที่เปิดใช้งาน", href: "/organizer/academic-years", icon: Calendar },
    { label: "กิจกรรมทั้งหมด", value: activityCount, hint: `เปิดรับลงทะเบียน ${publishedCount} กิจกรรม`, href: "/organizer/activities", icon: CalendarDays },
  ];
  const shortcuts = [
    { title: "ดาวสีเขียว / นิสิตช่วยงาน", description: "มอบหมายผู้ช่วยงานและยืนยันให้ดาวสีเขียว", href: "/organizer/green-stars", icon: Users },
    { title: "จัดการปีการศึกษา", description: "สร้าง แก้ไข เปิดใช้งาน และปิดรอบปีการศึกษา", href: "/organizer/academic-years", icon: Calendar },
    { title: "จัดการกิจกรรม", description: "สร้างกิจกรรม เปิดรับลงทะเบียน สร้าง QR และบันทึกเวลาเข้างาน", href: "/organizer/activities", icon: CalendarDays },
    { title: "ข้อมูลนิสิต", description: "ดูภาพรวม ประวัติกิจกรรม ดาวสะสม และโปรไฟล์ของนิสิต", href: "/organizer/students", icon: Users },
    { title: "โปรไฟล์ของฉัน", description: "ตรวจสอบข้อมูลบัญชีและบทบาทในระบบ", href: "/organizer/profile", icon: User },
  ];
  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">ผู้จัดกิจกรรม</Badge>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">ภาพรวมผู้จัดกิจกรรม</h1>
        <p className="mt-1 text-sm text-muted-foreground">ยินดีต้อนรับคุณ {user.name ?? "ผู้จัดกิจกรรม"}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return <Link key={stat.href} href={stat.href}>
            <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2"><span className="text-xs font-semibold text-muted-foreground">{stat.label}</span><Icon className="size-5 text-primary" /></CardHeader>
              <CardContent><p className="text-3xl font-bold tabular-nums">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p></CardContent>
            </Card>
          </Link>;
        })}
      </div>
      <div>
        <h2 className="mb-3 text-base font-semibold">เมนูการจัดการหลัก</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return <Link key={item.href} href={item.href}>
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2"><CardTitle className="flex items-center gap-3 text-base"><Icon className="size-5 text-primary" />{item.title}</CardTitle><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></CardHeader>
                <CardContent><CardDescription>{item.description}</CardDescription></CardContent>
              </Card>
            </Link>;
          })}
        </div>
      </div>
    </div>
  );
}
