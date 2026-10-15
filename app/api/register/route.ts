import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { studentRegisterSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const parsed = studentRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.user.findFirst({ where: { OR: [
        { username: input.username }, { email: input.email }, { studentCode: input.studentCode },
      ] } });
      if (duplicate) return { error: "ชื่อผู้ใช้ อีเมล หรือรหัสนิสิตนี้มีอยู่แล้ว", status: 409 } as const;

      const studentRole = await tx.role.findUnique({ where: { name: "STUDENT" } });
      if (!studentRole) {
        return { error: "ยังไม่สามารถสมัครสมาชิกได้ กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่าบทบาทนิสิต", status: 500 } as const;
      }

      const user = await tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          studentCode: input.studentCode,
          passwordHash,
          firstname: input.firstname || null,
          lastname: input.lastname || null,
          isActive: true,
          userRoles: { create: [{ roleId: studentRole.id }] },
        },
        select: { id: true },
      });
      return { userId: String(user.id) };
    }, { isolationLevel: "Serializable" });

    if (result.error) return NextResponse.json({ message: result.error }, { status: result.status });
    return NextResponse.json(
      { success: true, message: "ลงทะเบียนสำเร็จเรียบร้อย", userId: result.userId },
      { status: 201 },
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json({ message: "ชื่อผู้ใช้ อีเมล หรือรหัสนิสิตนี้มีอยู่แล้ว" }, { status: 409 });
    }
    if (code === "P2034") {
      return NextResponse.json({ message: "มีการสมัครสมาชิกพร้อมกัน กรุณาลองใหม่อีกครั้ง" }, { status: 409 });
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการลงทะเบียน กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
