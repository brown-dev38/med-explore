import { Suspense } from "react";
import { requireAuth } from "@/lib/dal";
import { ScanClient } from "./scan-client";

export const metadata = {
  title: "สแกน QR | MedExplore Star",
};

export default function ScanPage() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-8 sm:p-6">
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
