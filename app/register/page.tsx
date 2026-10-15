import { AuthShell } from "@/components/auth-shell";
import RegisterForm from "./register-form";

export const metadata = { title: "สมัครสมาชิก | MedExplore Star" };

export default function RegisterPage() {
  return (
    <AuthShell title="สมัครสมาชิกสำหรับนิสิต" description="ใช้รหัสนิสิตเพื่อสร้างบัญชี เข้าร่วมกิจกรรมและสะสมดาวกับ MedExplore Star">
      <RegisterForm />
    </AuthShell>
  );
}
