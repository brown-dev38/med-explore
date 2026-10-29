import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is disabled in production. Use npm run db:bootstrap to initialize roles and the first ADMIN without demo data.");
}

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

const PERMISSIONS: { code: string; description: string }[] = [
  { code: "user.manage", description: "จัดการผู้ใช้งานและบทบาท" },
  { code: "academic_year.manage", description: "จัดการปีการศึกษา" },
  { code: "activity.manage", description: "สร้างและแก้ไขกิจกรรม" },
  { code: "attendance.record", description: "บันทึกการเข้า-ออกกิจกรรม" },
  { code: "participation.review", description: "ตรวจสอบการเข้าร่วมกิจกรรม" },
  { code: "star.approve", description: "อนุมัติการให้ดาว" },
  { code: "reward.manage", description: "จัดการของรางวัล" },
  { code: "reward.redeem", description: "แลกของรางวัล" },
  { code: "survey.manage", description: "จัดการแบบประเมิน" },
  { code: "audit.view", description: "ดูบันทึกการใช้งานระบบ" },
];

const ROLES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: "ADMIN",
    description: "ผู้ดูแลระบบ",
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    name: "ORGANIZER",
    description: "ผู้จัดกิจกรรม",
    permissions: [
      "academic_year.manage",
      "activity.manage",
      "attendance.record",
      "participation.review",
      "star.approve",
      "reward.manage",
      "survey.manage",
    ],
  },
  {
    name: "STUDENT",
    description: "นิสิตผู้เข้าร่วมกิจกรรม",
    permissions: ["reward.redeem"],
  },
];

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions`);

  for (const role of ROLES) {
    const created = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });

    for (const code of role.permissions) {
      const permission = await prisma.permission.findUnique({
        where: { code },
      });
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: created.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: created.id, permissionId: permission.id },
      });
    }
  }
  console.log(`Seeded ${ROLES.length} roles and their permissions`);

  const demoUsers = [
    {
      username: "admin",
      email: "admin@medexplore.local",
      password: "Admin@1234",
      firstname: "ผู้ดูแล",
      lastname: "ระบบ",
      studentCode: null as string | null,
      role: "ADMIN",
    },
    {
      username: "organizer",
      email: "organizer@medexplore.local",
      password: "Organizer@1234",
      firstname: "ผู้จัด",
      lastname: "กิจกรรม",
      studentCode: null as string | null,
      role: "ORGANIZER",
    },
    {
      username: "student",
      email: "student@medexplore.local",
      password: "Student@1234",
      firstname: "สมชาย",
      lastname: "ใจดี",
      studentCode: "6601000001",
      role: "STUDENT",
    },
    {
      username: "student2",
      email: "student2@medexplore.local",
      password: "Student@1234",
      firstname: "สมหญิง",
      lastname: "รักเรียน",
      studentCode: "6601000002",
      role: "STUDENT",
    },
    {
      username: "student3",
      email: "student3@medexplore.local",
      password: "Student@1234",
      firstname: "สมศักดิ์",
      lastname: "ขยันดี",
      studentCode: "6601000003",
      role: "STUDENT",
    },
    {
      username: "student4",
      email: "student4@medexplore.local",
      password: "Student@1234",
      firstname: "ปิยะ",
      lastname: "ตั้งใจ",
      studentCode: "6601000004",
      role: "STUDENT",
    },
    {
      username: "student5",
      email: "student5@medexplore.local",
      password: "Student@1234",
      firstname: "มาลี",
      lastname: "สุขใจ",
      studentCode: "6601000005",
      role: "STUDENT",
    },
  ];

  for (const demo of demoUsers) {
    const passwordHash = await bcrypt.hash(demo.password, 10);
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {
        username: demo.username,
        passwordHash,
        firstname: demo.firstname,
        lastname: demo.lastname,
        studentCode: demo.studentCode,
        isActive: true,
      },
      create: {
        username: demo.username,
        email: demo.email,
        passwordHash,
        firstname: demo.firstname,
        lastname: demo.lastname,
        studentCode: demo.studentCode,
        isActive: true,
      },
    });

    const role = await prisma.role.findUnique({ where: { name: demo.role } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId: user.id },
        update: { roleId: role.id },
        create: { userId: user.id, roleId: role.id },
      });
    }
  }
  console.log(`Seeded ${demoUsers.length} demo users`);
  console.log(
    "Demo credentials: admin/Admin@1234, organizer/Organizer@1234, student-student5/Student@1234",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
