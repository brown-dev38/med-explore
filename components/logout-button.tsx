"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutClient } from "@/lib/auth-client";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await signOutClient("/");
      router.push("/");
      router.refresh();
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-slate-200 dark:hover:bg-neutral-800 ${className}`}
    >
      {isLoading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
    </button>
  );
}
