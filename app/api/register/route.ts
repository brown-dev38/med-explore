import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      studentCode,
      username,
      email,
      password,
      firstname,
      lastname,
    } = body;

    // ตรวจสอบข้อมูลจำเป็น
    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    const trimmedStudentCode = studentCode?.trim() || null;
    const trimmedFirstname = firstname?.trim() || null;
    const trimmedLastname = lastname?.trim() || null;

    // ตรวจสอบความยาวรหัสผ่าน
    if (password.length < 6) {
      return NextResponse.json(
        { message: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร" },
        { status: 400 }
      );
    }

    // ตรวจสอบอีเมลซ้ำ
    const existingEmail = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existingEmail) {
      return NextResponse.json(
        { message: "อีเมลนี้มีผู้ใช้งานในระบบแล้ว" },
        { status: 409 }
      );
    }

    // ตรวจสอบรหัสนิสิตซ้ำ (หากระบุ)
    if (trimmedStudentCode) {
      const existingStudentCode = await prisma.user.findUnique({
        where: { studentCode: trimmedStudentCode },
      });
      if (existingStudentCode) {
        return NextResponse.json(
          { message: "รหัสนิสิตนี้มีผู้ใช้งานในระบบแล้ว" },
          { status: 409 }
        );
      }
    }

    // เข้ารหัสรหัสผ่าน
    const passwordHash = await bcrypt.hash(password, 10);

    // บันทึกผู้ใช้ใหม่
    const newUser = await prisma.user.create({
      data: {
        studentCode: trimmedStudentCode,
        username: trimmedUsername,
        email: trimmedEmail,
        passwordHash,
        firstname: trimmedFirstname,
        lastname: trimmedLastname,
        isActive: true,
      },
    });

    // กำหนด Role เริ่มต้น (เช่น STUDENT หรือค้นหา role ที่มีอยู่)
    try {
      const studentRole = await prisma.role.findFirst({
        where: {
          name: {
            in: ["STUDENT", "student", "นิสิต", "USER", "user"],
          },
        },
      });

      if (studentRole) {
        await prisma.userRole.create({
          data: {
            userId: newUser.id,
            roleId: studentRole.id,
          },
        });
      }
    } catch {
      // หากยังไม่มีตาราง roles หรือเกิดข้อผิดพลาดในการใส่ role ให้ข้ามไปก่อน
    }

    return NextResponse.json(
      {
        success: true,
        message: "ลงทะเบียนสำเร็จเรียบร้อย",
        userId: String(newUser.id),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการลงทะเบียน กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}

