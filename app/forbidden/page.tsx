import Link from "next/link";

export const metadata = {
  title: "ไม่มีสิทธิ์เข้าถึง | MedExplore Star",
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-sky-50/50 to-indigo-50/40 px-6 text-center dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <span className="text-5xl font-extrabold text-indigo-600 dark:text-indigo-400">
        403
      </span>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </h1>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        บัญชีของคุณไม่ได้รับอนุญาตให้เข้าถึงส่วนนี้
        หากคิดว่าเป็นความผิดพลาดกรุณาติดต่อผู้ดูแลระบบ
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center rounded-full bg-gradient-to-r from-indigo-600 to-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:from-indigo-500 hover:to-sky-500 transition-all"
      >
        กลับสู่หน้าแรก
      </Link>
    </main>
  );
}
