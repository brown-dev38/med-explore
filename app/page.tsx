import { Suspense } from "react";
import { SessionNav } from "@/components/session-nav";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="w-full border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 text-amber-300">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              MedExplore Star
            </span>
          </div>
          <Suspense
            fallback={<div className="h-9 w-40 animate-pulse rounded-full bg-slate-200 dark:bg-neutral-800" />}
          >
            <SessionNav />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          ระบบสะสมดาวและแลกของรางวัลกิจกรรม
        </h1>
        <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          เข้าร่วมกิจกรรม สะสมดาว และแลกของรางวัลปลายปีการศึกษา
          ผ่านระบบ MedExplore Star
        </p>
      </main>
    </div>
  );
}
