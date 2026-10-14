import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { PERMISSIONS } from "@/lib/permissions";
import { toUserDto } from "@/lib/users";
import type { UserListResult } from "@/types/user";
import { UsersTable } from "./users-table";

export const metadata = {
  title: "ผู้ใช้งาน | MedExplore Star",
};

const PAGE_SIZE = 10;

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <UsersContent />
    </Suspense>
  );
}

async function UsersContent() {
  await requirePermission(PERMISSIONS.USER_MANAGE);

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  const initialResult: UserListResult = {
    items: users.map(toUserDto),
    total,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          จัดการผู้ใช้งาน
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ค้นหา แก้ไขโปรไฟล์ มอบบทบาท และปิด/เปิดบัญชีผู้ใช้
        </p>
      </div>
      <UsersTable initialResult={initialResult} />
    </div>
  );
}
