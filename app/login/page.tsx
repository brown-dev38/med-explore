import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import LoginForm from "./login-form";

export const metadata = { title: "เข้าสู่ระบบ | MedExplore Star" };

export default function LoginPage() {
  return (
    <AuthShell title="ยินดีต้อนรับกลับมา" description="เข้าสู่ระบบเพื่อเข้าร่วมกิจกรรมและติดตามการสะสมดาวของคุณ">
      <Suspense fallback={<div role="status" className="h-60 animate-pulse rounded-xl bg-muted p-6 text-sm text-muted-foreground">กำลังโหลดแบบฟอร์ม...</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
