import { Suspense } from "react";
import { requireAuth } from "@/lib/dal";
import { ScanClient } from "./scan-client";

export const metadata = {
  title: "สแกน QR | MedExplore Star",
};

export default function ScanPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-sky-50/50 to-indigo-50/40 p-6 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <Suspense
        fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}
      >
        <ScanContent />
      </Suspense>
    </main>
  );
}

async function ScanContent() {
  await requireAuth();
  return <ScanClient />;
}
