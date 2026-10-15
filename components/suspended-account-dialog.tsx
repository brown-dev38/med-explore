"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SESSION_NOTICES } from "@/lib/session-notices";

export function SuspendedAccountDialog({ open, onConfirm, loading = false, confirmText = "รับทราบ" }: {
  open: boolean;
  onConfirm: () => void;
  loading?: boolean;
  confirmText?: string;
}) {
  const notice = SESSION_NOTICES["account-suspended"];
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <AlertDialogTitle>{notice.title}</AlertDialogTitle>
          <AlertDialogDescription>{notice.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction type="button" disabled={loading} onClick={onConfirm}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "กำลังออกจากระบบ..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
