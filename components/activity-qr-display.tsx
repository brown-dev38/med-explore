"use client";

import { useState } from "react";
import Image from "next/image";
import { Clock, Download, Maximize2 } from "lucide-react";
import type { QrSessionDto } from "@/types/activity";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function SaveQrButton({ qr }: { qr: QrSessionDto }) {
  const purpose = qr.purpose === "CHECK_IN" ? "check-in" : "check-out";
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<a href={qr.qrDataUrl} download={`medexplore-${purpose}-${qr.id}.png`} />}>
      <Download className="size-3.5" aria-hidden="true" />บันทึก PNG
    </Button>
  );
}

export function ActivityQrDisplay({ qr, activityTitle, remaining }: {
  qr: QrSessionDto;
  activityTitle: string;
  remaining: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const purpose = qr.purpose === "CHECK_IN" ? "เช็คอิน (Check-in)" : "เช็คเอาท์ (Check-out)";
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-3 sm:w-52">
      <button type="button" onClick={() => setExpanded(true)} aria-label={`ขยาย QR Code ${purpose}`} aria-haspopup="dialog" aria-expanded={expanded} className="rounded-xl transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Image src={qr.qrDataUrl} alt={`QR Code ${purpose} สำหรับ ${activityTitle}`} width={1024} height={1024} unoptimized className="size-52 rounded-xl border bg-white p-2 shadow-sm" />
      </button>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}><Maximize2 className="size-3.5" aria-hidden="true" />ขยาย QR</Button>
        <SaveQrButton qr={qr} />
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="gap-4 p-4 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle>QR Code {purpose}</DialogTitle>
            <p className="break-words text-sm font-medium">{activityTitle}</p>
            <DialogDescription>ใช้ได้ถึง {formatThaiDateTime(qr.expiresAt)} · ภาพที่บันทึกจะหมดอายุตามเวลานี้เช่นกัน</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 justify-center">
            <Image src={qr.qrDataUrl} alt={`QR Code ${purpose} สำหรับ ${activityTitle}`} width={1024} height={1024} unoptimized className="aspect-square w-full max-w-[min(100%,60dvh)] rounded-xl bg-white p-4 object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-lg font-bold tabular-nums ${remaining <= 10 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><Clock className="size-4" aria-hidden="true" />{countdown}</span>
            <SaveQrButton qr={qr} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
