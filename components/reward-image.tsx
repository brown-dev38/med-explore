"use client";

import { useState } from "react";
import Image from "next/image";
import { Gift } from "lucide-react";
import { cn } from "cn";

export function RewardImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={cn("relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-xl bg-muted/50", className)}>
      {src && src !== failedSrc ? (
        <Image src={src} alt={`ของรางวัล ${name}`} fill unoptimized sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-3" onError={() => setFailedSrc(src)} />
      ) : <Gift className="size-12 text-primary/40" aria-hidden="true" />}
    </div>
  );
}
