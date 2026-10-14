import { Suspense } from "react";
import Link from "next/link";
import { ProfileView } from "@/components/profile-view";
import { SessionNav } from "@/components/session-nav";

export const metadata = {
  title: "โปรไฟล์ | MedExplore Star",
};

export default function ProfilePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-base font-bold tracking-tight text-slate-900 dark:text-white"
          >
            MedExplore Star
          </Link>
          <Suspense
            fallback={
              <div className="h-9 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-neutral-800" />
            }
          >
            <SessionNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
          <ProfileView />
        </Suspense>
      </main>
    </div>
  );
}
