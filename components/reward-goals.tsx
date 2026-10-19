import Link from "next/link";
import { Gift, ArrowRight, Star } from "lucide-react";
import type { RewardBalance, RewardDto } from "@/types/reward";
import { RewardImage } from "@/components/reward-image";

export function RewardGoals({ academicYearId, balance, rewards, canRedeem }: {
  academicYearId: string;
  balance: RewardBalance;
  rewards: RewardDto[];
  canRedeem: boolean;
}) {
  const goals = [...rewards].sort((a, b) => Number(b.isActive && b.stockQuantity !== 0) - Number(a.isActive && a.stockQuantity !== 0)).slice(0, 3);
  const href = `/dashboard/rewards?academicYearId=${academicYearId}`;

  return (
    <section aria-labelledby="reward-goals-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="reward-goals-title" className="flex items-center gap-2 text-lg font-semibold"><Gift className="size-5 text-primary" aria-hidden="true" />ดาวของคุณ แลกอะไรได้บ้าง</h2><p className="mt-1 text-sm text-muted-foreground">เลือกเป้าหมายเล็ก ๆ แล้วค่อย ๆ เก็บดาวไปด้วยกัน</p></div>
        <Link href={href} className="inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ดูรางวัลทั้งหมด<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
      {goals.length === 0 ? (
        <p className="rounded-2xl bg-muted/40 p-5 text-sm text-muted-foreground">ของรางวัลสำหรับปีนี้กำลังรออัปเดต เก็บดาวจากกิจกรรมไว้ก่อนได้เลย</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {goals.map((reward) => {
            const missing = Math.max(0, reward.costPoints - balance.available);
            const ready = canRedeem && reward.isActive && reward.stockQuantity !== 0 && missing === 0;
            const status = !canRedeem ? "ดูรางวัลของปีนี้" : !reward.isActive ? "ยังไม่เปิดให้แลก" : reward.stockQuantity === 0 ? "ของรางวัลหมดแล้ว" : missing ? `เก็บเพิ่มอีก ${missing} ดาว` : "ดาวถึงแล้ว ไปแลกกัน!";
            return (
              <Link key={reward.id} href={href} className="group flex min-w-0 gap-4 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RewardImage src={reward.imageUrl} name={reward.name} className="aspect-square size-20 shrink-0 self-center" />
                <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{reward.name}</h3><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3.5 fill-amber-300 text-amber-600" aria-hidden="true" />{reward.costPoints} ดาว</p><progress aria-label={`เป้าหมาย ${reward.name}`} className="mt-3 block h-1.5 w-full overflow-hidden rounded-full accent-primary" value={Math.min(balance.available, reward.costPoints)} max={reward.costPoints} /><p className={`mt-2 text-xs ${ready ? "font-semibold text-primary" : "text-muted-foreground"}`}>{status}</p></div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
