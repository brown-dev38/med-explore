import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/dal";

export const metadata = {
  title: "ภาพรวมผู้ดูแลระบบ | MedExplore Star",
};

export default function AdminHomePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
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
    },
    {
      label: "ปีการศึกษา",
      value: academicYearCount,
      hint: activeYear
        ? `ปีที่ใช้งาน: ${activeYear.code}`
        : "ยังไม่มีปีที่เปิดใช้งาน",
      href: "/admin/academic-years",
    },
    {
      label: "กิจกรรมทั้งหมด",
      value: activityCount,
      hint: `เปิดรับลงทะเบียน ${publishedCount} กิจกรรม`,
      href: "/admin/activities",
    },
  ];

  const shortcuts = [
    {
      href: "/admin/academic-years",
      title: "จัดการปีการศึกษา",
      description: "สร้าง เปิดใช้งาน และปิดปีการศึกษา",
    },
    {
      href: "/admin/users",
      title: "จัดการผู้ใช้งาน",
      description: "ค้นหา แก้ไขโปรไฟล์ มอบบทบาท และปิดบัญชี",
    },
    {
      href: "/admin/activities",
      title: "จัดการกิจกรรม",
      description: "สร้างกิจกรรม เปิดรับลงทะเบียน และบันทึกการเข้างาน",
    },
    {
      href: "/admin/profile",
      title: "โปรไฟล์ของฉัน",
      description: "ดูข้อมูลบัญชีและบทบาทของคุณ",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          ภาพรวมผู้ดูแลระบบ
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ยินดีต้อนรับ {user.name ?? "ผู้ดูแล"}
          {user.role ? ` (${user.role})` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {stat.hint}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {item.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {item.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
