"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOutClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LogoutButton({ className = "", iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await signOutClient("/");
      router.push("/");
      router.refresh();
      return true;
    } catch {
      toast.error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setIsLoading(false);
      return false;
    }
  };

  const button = (
    <Button
      variant="outline"
      size={iconOnly ? "icon-sm" : "sm"}
      onClick={() => setConfirmOpen(true)}
      disabled={isLoading}
      className={`gap-1.5 ${className}`}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      <span className={iconOnly ? "sr-only" : undefined}>{isLoading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}</span>
    </Button>
  );

  return (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent side="right" sideOffset={12}>ออกจากระบบ</TooltipContent>
        </Tooltip>
      ) : button}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ยืนยันการออกจากระบบ"
        description="คุณต้องการออกจากระบบ MedExplore Star ใช่หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        variant="destructive"
        loading={isLoading}
        onConfirm={handleLogout}
      />
    </>
  );
}
