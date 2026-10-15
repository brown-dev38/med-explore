"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CircleHelp, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: () => void | boolean | Promise<void | boolean>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "default",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);
  const inFlight = React.useRef(false);
  const disabled = loading || pending;
  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const success = await onConfirm();
      if (success !== false) onOpenChange(false);
    } catch {
      toast.error("ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!disabled) onOpenChange(next); }}>
      <AlertDialogContent className="sm:max-w-md" aria-busy={disabled}>
        <AlertDialogHeader>
          <div className={`mb-2 flex size-12 items-center justify-center rounded-2xl ${variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {variant === "destructive" ? <TriangleAlert className="size-6" /> : <CircleHelp className="size-6" />}
          </div>
          <AlertDialogTitle className="text-base font-semibold">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex gap-2">
          <AlertDialogCancel
            disabled={disabled}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={disabled}
            onClick={handleConfirm}
          >
            {disabled && <Loader2 className="h-4 w-4 animate-spin" />}
            {disabled ? "กำลังดำเนินการ..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

