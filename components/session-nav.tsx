import Link from "next/link";
import { auth } from "@/lib/auth";
import { dashboardPathFor, hasRole, ROLES } from "@/lib/permissions";
import { LogoutButton } from "./logout-button";

export async function SessionNav() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          เข้าสู่ระบบ
        </Link>
        <Link
          href="/register"
          className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2 text-sm font-medium text-white hover:from-indigo-500 hover:to-sky-500 transition-all"
        >
          สมัครสมาชิก
        </Link>
      </div>
    );
  }

  const user = session.user;

  const linkClass =
    "font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white";

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {user.name ?? "ผู้ใช้งาน"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {user.role ?? "ไม่มีบทบาท"}
        </p>
      </div>
      <nav className="flex items-center gap-3 text-sm">
        <Link href={dashboardPathFor(user)} className={linkClass}>
          แดชบอร์ด
        </Link>
        <Link href={hasRole(user, ROLES.ADMIN) ? "/admin/activities" : hasRole(user, ROLES.ORGANIZER) ? "/organizer/activities" : "/dashboard/activities"} className={linkClass}>
          กิจกรรม
        </Link>
        <Link href="/profile" className={linkClass}>
          โปรไฟล์
        </Link>
      </nav>
      <LogoutButton />
    </div>
  );
}
