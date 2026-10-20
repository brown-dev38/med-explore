"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ActivityPublishButton({ endsAt, disabled = false, onPublish, size = "sm" }: {
  endsAt: string;
  disabled?: boolean;
  onPublish: () => void;
  size?: "default" | "sm";
}) {
  const hintId = useId();
  const [now, setNow] = useState(() => Date.now());
  const expired = Date.parse(endsAt) <= now;

  useEffect(() => {
    if (expired) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expired]);

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <Button
        variant="default"
        size={size}
        disabled={disabled || expired}
        aria-describedby={expired ? hintId : undefined}
        onClick={() => {
          // Recheck when clicked, including before the next clock tick.
          if (Date.parse(endsAt) <= Date.now()) {
            setNow(Date.now());
            return;
          }
          onPublish();
        }}
      >
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        เปิดรับลงทะเบียน
      </Button>
      {expired && (
        <p id={hintId} role="status" className="max-w-64 text-left text-xs whitespace-normal text-amber-700 dark:text-amber-400">
          เลยกำหนดเวลา — ยังไม่ได้เปิดรับลงทะเบียน
          <br />กรุณาแก้ไขเวลาก่อน
        </p>
      )}
    </div>
  );
}
