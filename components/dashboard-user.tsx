import { auth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export async function DashboardUser() {
  const session = await auth();
  if (!session?.user) return null;

  const name = session.user.name ?? "ผู้ใช้งาน";
  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {session.user.role ?? "ไม่มีบทบาท"}
          </p>
        </div>
      </div>
      <LogoutButton className="w-full justify-center" />
    </div>
  );
}
