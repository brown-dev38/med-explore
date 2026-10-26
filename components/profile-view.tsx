import { redirect } from "next/navigation";
import {
  User,
  Shield,
  GraduationCap,
  CalendarCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { toUserDto } from "@/lib/users";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function ProfileView({ target, studentDashboard = false }: { target?: StudentTarget; studentDashboard?: boolean }) {
  const sessionUser = target || studentDashboard
    ? (await getStudentDashboardContext(target)).user
    : await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: BigInt(sessionUser.id) },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) redirect("/login");

  const profile = toUserDto(user);
  const fullName =
    [profile.firstname, profile.lastname].filter(Boolean).join(" ") ||
    profile.username;

  const fields = [
    { label: "ชื่อ-นามสกุล", value: fullName },
    { label: "ชื่อผู้ใช้", value: profile.username },
    { label: "รหัสนิสิต", value: profile.studentCode ?? "-" },
    { label: "อีเมล", value: profile.email },
  ];

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Shield className="mr-1 h-3 w-3 text-indigo-500" />;
      case "ORGANIZER":
        return <CalendarCheck className="mr-1 h-3 w-3 text-sky-500" />;
      default:
        return <GraduationCap className="mr-1 h-3 w-3 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {target ? "โปรไฟล์ของนิสิต" : "โปรไฟล์ของฉัน"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ข้อมูลบัญชีผู้ใช้งานและบทบาทในระบบ MedExplore Star
        </p>
      </div>

      <Card>
        <CardHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground">
                {fullName}
              </CardTitle>
              <CardDescription className="text-xs">
                {profile.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {field.value}
                </dd>
              </div>
            ))}

            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                สถานะบัญชี
              </dt>
              <dd>
                {profile.isActive ? (
                  <Badge variant="default" className="gap-1 bg-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    ใช้งานปกติ
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    ปิดใช้งาน
                  </Badge>
                )}
              </dd>
            </div>

            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                บทบาทที่ได้รับ
              </dt>
              <dd className="flex flex-wrap gap-1.5 pt-0.5">
                {profile.roles.length === 0 && (
                  <span className="text-xs text-muted-foreground">ไม่มีบทบาท</span>
                )}
                {profile.roles.map((roleName) => (
                  <Badge key={roleName} variant="secondary" className="text-xs">
                    {getRoleIcon(roleName)}
                    {roleName}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {!target && <ChangePasswordForm hasPassword={Boolean(user.passwordHash)} />}
    </div>
  );
}
