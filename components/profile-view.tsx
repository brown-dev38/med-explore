import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { toUserDto } from "@/lib/users";

export async function ProfileView() {
  const sessionUser = await requireAuth();

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
    { label: "สถานะบัญชี", value: profile.isActive ? "ใช้งาน" : "ปิดใช้งาน" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          โปรไฟล์ของฉัน
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ข้อมูลบัญชีและการเข้าร่วมระบบ MedExplore Star
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {field.label}
              </dt>
              <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                {field.value}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              บทบาท
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.roles.length === 0 && (
                <span className="text-sm text-slate-400">ไม่มีบทบาท</span>
              )}
              {profile.roles.map((roleName) => (
                <span
                  key={roleName}
                  className="inline-flex rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                >
                  {roleName}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
