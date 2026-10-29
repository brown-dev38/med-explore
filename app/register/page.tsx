import { AuthShell } from "@/components/auth-shell";
import RegisterForm from "./register-form";

export const metadata = { title: "สมัครสมาชิก | MedExplore Star" };

export default function RegisterPage() {
  return (
    <AuthShell title="สมัครสมาชิก" description="">
      <RegisterForm />
    </AuthShell>
  );
}
