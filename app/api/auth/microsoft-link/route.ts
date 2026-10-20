import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api";
import { getMicrosoftConfig, MICROSOFT_LINK_COOKIE, microsoftLinkCookieOptions } from "@/lib/microsoft-config";
import { MicrosoftAccountError, prepareMicrosoftLink, unlinkMicrosoftAccount } from "@/lib/microsoft-accounts";
import { dashboardPathFor } from "@/lib/permissions";
import { isSameOriginRequest } from "@/lib/request-origin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  const enabled = Boolean(getMicrosoftConfig());
  const account = enabled ? await prisma.microsoftAccount.findUnique({ where: { userId: BigInt(user.id) }, select: { label: true, linkedAt: true } }) : null;
  const response = successResponse({ enabled, account: account ? { label: account.label, linkedAt: account.linkedAt.toISOString() } : null });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function change(request: Request, unlink: boolean) {
  const origin = request.headers.get("origin");
  if (!isSameOriginRequest(request)) return errorResponse("คำขอไม่ถูกต้อง กรุณาลองใหม่จากหน้าเว็บไซต์", 403);
  if (!getMicrosoftConfig()) return errorResponse("การเข้าสู่ระบบด้วย Microsoft ยังไม่เปิดให้บริการ", 503);
  if (process.env.NEXTAUTH_URL && origin !== new URL(process.env.NEXTAUTH_URL).origin) {
    return errorResponse("กรุณาเปิดเว็บไซต์ผ่าน URL หลักของระบบก่อนใช้งาน Microsoft", 409);
  }
  const body = await request.json().catch(() => null);
  if (!unlink && body?.action === "login") {
    const response = successResponse({ ready: true });
    response.cookies.set(MICROSOFT_LINK_COOKIE, "", { ...microsoftLinkCookieOptions(), maxAge: 0 });
    return response;
  }
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  const password = body?.password;
  if (typeof password !== "string" || !password || password.length > 1024) return errorResponse("กรุณายืนยันรหัสผ่านปัจจุบัน", 400);
  try {
    if (unlink) {
      await unlinkMicrosoftAccount(user.id, password);
      const response = successResponse({ unlinked: true });
      response.cookies.set(MICROSOFT_LINK_COOKIE, "", { ...microsoftLinkCookieOptions(), maxAge: 0 });
      return response;
    }
    const token = await prepareMicrosoftLink(user.id, password);
    const response = NextResponse.json({ success: true, data: { callbackUrl: `${dashboardPathFor(user)}/profile?microsoft=linked` } });
    response.cookies.set(MICROSOFT_LINK_COOKIE, token, microsoftLinkCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof MicrosoftAccountError) return errorResponse(error.code === "password" ? "รหัสผ่านไม่ถูกต้อง หรือบัญชีไม่พร้อมใช้งาน" : "บัญชีนี้ผูก Microsoft แล้ว กรุณาโหลดข้อมูลใหม่", error.status);
    return errorResponse("ดำเนินการกับบัญชี Microsoft ไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

export function POST(request: Request) { return change(request, false); }
export function DELETE(request: Request) { return change(request, true); }
