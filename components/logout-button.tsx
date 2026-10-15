"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOutClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function LogoutButton({ className = "" }: { className?: string }) {
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

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={isLoading}
        className={`gap-1.5 ${className}`}
      >
        <LogOut className="h-3.5 w-3.5" />
        {isLoading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
      </Button>

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
