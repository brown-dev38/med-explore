export const SESSION_NOTICES = {
  "account-suspended": {
    title: "บัญชีของคุณถูกระงับ",
    message: "กรุณาติดต่อผู้ดูแลระบบเพื่อสอบถามหรือขอเปิดใช้งานบัญชีอีกครั้ง",
  },
  "account-deleted": {
    title: "บัญชีของคุณถูกลบแล้ว",
    message: "ไม่สามารถใช้งานบัญชีนี้ต่อได้ กรุณาติดต่อผู้ดูแลระบบ",
  },
  "session-expired": {
    title: "เซสชันหมดอายุ",
    message: "กรุณาเข้าสู่ระบบอีกครั้งเพื่อใช้งานต่อ",
  },
} as const;

export type SessionExitReason = keyof typeof SESSION_NOTICES;

export function getSessionNotice(reason: string | null) {
  return reason && Object.hasOwn(SESSION_NOTICES, reason)
    ? SESSION_NOTICES[reason as SessionExitReason] : null;
}

export function sessionExitReason(session: unknown): SessionExitReason | null {
  const value = session as { accountStatus?: string; user?: { id?: string } } | null;
  if (value?.accountStatus === "SUSPENDED") return "account-suspended";
  if (value?.accountStatus === "DELETED") return "account-deleted";
  if (!value?.user?.id) return "session-expired";
  return null;
}

export function sessionLoginPath(reason: SessionExitReason) {
  return `/login?reason=${reason}`;
}
