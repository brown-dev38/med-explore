import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import LoginForm from "./login-form";
import { connection } from "next/server";
import { getMicrosoftConfig } from "@/lib/microsoft-config";

export const metadata = { title: "เข้าสู่ระบบ | MedExplore Star" };

async function LoginContent() {
  await connection();
  return <LoginForm microsoftEnabled={Boolean(getMicrosoftConfig())} />;
}

export default function LoginPage() {
  return (
    <AuthShell title="ยินดีต้อนรับกลับมา" description="เข้าสู่ระบบเพื่อเข้าร่วมกิจกรรมและติดตามการสะสมดาวของคุณ">
      <Suspense fallback={<div role="status" className="h-60 animate-pulse rounded-xl bg-muted p-6 text-sm text-muted-foreground">กำลังโหลดแบบฟอร์ม...</div>}>
        <LoginContent />
      </Suspense>
    </AuthShell>
  );
}
