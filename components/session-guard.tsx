"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { signOutClient } from "@/lib/auth-client";
import { monitorSession } from "@/lib/session-monitor";
import { SESSION_NOTICES, sessionLoginPath, type SessionExitReason } from "@/lib/session-notices";
import { SuspendedAccountDialog } from "@/components/suspended-account-dialog";

const PROTECTED_PATHS = ["/dashboard", "/admin", "/organizer", "/scan", "/profile"];

export function SessionGuard() {
  const pathname = usePathname();
  const [reason, setReason] = useState<SessionExitReason | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (reason || !PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return;
    return monitorSession(async (nextReason) => {
      setSigningOut(true);
      setReason(nextReason);
      const destination = sessionLoginPath(nextReason);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        await signOutClient(destination, controller.signal);
      } catch {
        // Login also clears unusable session cookies if sign-out is interrupted.
      } finally {
        window.clearTimeout(timeout);
        setSigningOut(false);
        if (nextReason !== "account-suspended") window.location.replace(destination);
      }
    });
  }, [pathname, reason]);

  if (!reason) return null;
  if (reason === "account-suspended") {
    return <SuspendedAccountDialog open loading={signingOut} confirmText="กลับไปหน้าเข้าสู่ระบบ"
      onConfirm={() => window.location.replace("/login")} />;
  }
  const notice = SESSION_NOTICES[reason];
  return (
    <AlertDialog open>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <ShieldAlert className="mb-2 size-8 text-destructive" />
          <AlertDialogTitle>{notice.title}</AlertDialogTitle>
          <AlertDialogDescription>{notice.message}<span className="mt-2 block">กำลังออกจากระบบ...</span></AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
