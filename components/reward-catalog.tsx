"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Star } from "lucide-react";
import { toast } from "sonner";
import type { RewardBalance, RewardDto } from "@/types/reward";
import { mutateReward } from "@/lib/reward-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RewardImage } from "@/components/reward-image";

export function RewardCatalog({ rewards, balance, canRedeem }: { rewards: RewardDto[]; balance: RewardBalance; canRedeem: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ reward: RewardDto; requestId: string } | null>(null);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "ดาวที่ใช้แลกได้", value: balance.available }, { label: "ดาวที่จองรออนุมัติ", value: balance.reserved }, { label: "ดาวคงเหลือก่อนหักส่วนจอง", value: balance.balance }].map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 flex items-center gap-2 text-2xl font-semibold"><Star className="size-5 text-amber-500" />{item.value}</p></div>
        ))}
      </div>
      <p className="rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground">เมื่อส่งคำขอ ระบบจะจองดาวและรางวัล 1 ชิ้นไว้ระหว่างรออนุมัติ หากไม่อนุมัติหรือคุณยกเลิกคำขอก่อนอนุมัติ จะคืนดาวและจำนวนรางวัลให้{!canRedeem && " · ปีการศึกษานี้ยังไม่เปิดหรือปิดแล้ว จึงดูได้อย่างเดียว"}</p>
      {rewards.length > 0 && rewards.every((reward) => !reward.isActive) && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground">ยังไม่เปิดการแลกของรางวัล สามารถดูรายละเอียดและสะสมดาวรอได้</p>}
      {rewards.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground"><Gift className="mx-auto mb-3 size-10" />ยังไม่มีของรางวัลในปีนี้</CardContent></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rewards.map((reward) => {
            const missing = Math.max(0, reward.costPoints - balance.available);
            const out = reward.stockQuantity === 0;
            return (
              <Card key={reward.id}>
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <RewardImage src={reward.imageUrl} name={reward.name} />
                  <div><Badge variant={out ? "outline" : "secondary"}>{out ? "หมดแล้ว" : reward.stockQuantity === null ? "ไม่จำกัดจำนวน" : `เหลือ ${reward.stockQuantity} ชิ้น`}</Badge></div>
                  <div><h2 className="break-words text-lg font-semibold">{reward.name}</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{reward.description}</p>{!reward.isActive && <p className="mt-2 text-sm font-medium text-muted-foreground">ยังไม่เปิดการแลกของรางวัล</p>}</div>
                  <div className="mt-auto space-y-2"><p className="flex items-center gap-2 font-semibold"><Star className="size-4 fill-amber-400 text-amber-500" />{reward.costPoints} ดาว</p><progress className="h-2 w-full accent-primary" value={Math.min(balance.available, reward.costPoints)} max={reward.costPoints} aria-label={`ความคืบหน้าสะสมดาวสำหรับ ${reward.name}`} /><p className="text-xs text-muted-foreground">{missing ? `อีก ${missing} ดาวถึงเป้าหมาย` : "ดาวถึงเป้าหมายแล้ว"}</p></div>
                  <Button disabled={!canRedeem || !reward.isActive || out || missing > 0} onClick={() => setSelected({ reward, requestId: crypto.randomUUID() })}>{!reward.isActive ? "ยังไม่เปิดให้แลก" : out ? "ของรางวัลหมด" : missing ? `สะสมเพิ่มอีก ${missing} ดาว` : "แลกของรางวัล"}</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={!!selected} onOpenChange={(next) => { if (!next) setSelected(null); }} title="ยืนยันคำขอแลกรางวัล" description={`แลก “${selected?.reward.name ?? ""}” จำนวน 1 ชิ้น โดยใช้ ${selected?.reward.costPoints ?? 0} ดาว ระบบจะจองดาวและรางวัลไว้ แล้วรอ admin/organizer อนุมัติ`} confirmText="ส่งคำขอแลก" onConfirm={async () => {
        if (!selected) return false;
        try {
          await mutateReward("/api/reward-redemptions", "POST", { rewardTierId: selected.reward.id, requestId: selected.requestId, expectedCostPoints: selected.reward.costPoints });
          toast.success("ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ"); setSelected(null); router.refresh(); return true;
        } catch (failure) { toast.error(failure instanceof Error ? failure.message : "ส่งคำขอไม่สำเร็จ"); return false; }
      }} />
    </div>
  );
}
