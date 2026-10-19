import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { rewardBalance, rewardCatalog } from "@/lib/rewards";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RewardImage } from "@/components/reward-image";

export async function RewardGoals({ userId, academicYearId }: { userId: string; academicYearId: string }) {
  const [balance, rewards] = await Promise.all([rewardBalance(BigInt(userId), BigInt(academicYearId)), rewardCatalog(BigInt(academicYearId))]);
  const goals = rewards.slice(0, 3);
  return (
    <Card className="border-primary/20">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><Gift className="size-5 text-primary" />เป้าหมายของรางวัล</CardTitle><Link href={`/dashboard/rewards?academicYearId=${academicYearId}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">ดูรางวัลและแลกดาว <ArrowRight className="size-4" /></Link></div><CardDescription>ใช้แลกได้ {balance.available} ดาว · จองรออนุมัติ {balance.reserved} ดาว</CardDescription></CardHeader>
      <CardContent>{goals.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีของรางวัลในปีการศึกษานี้</p> : <div className="grid gap-3 sm:grid-cols-3">{goals.map((reward) => <div key={reward.id} className="rounded-xl border bg-muted/30 p-4"><RewardImage src={reward.imageUrl} name={reward.name} className="mb-3 aspect-video" /><h3 className="break-words text-sm font-semibold">{reward.name}</h3><p className="mt-1 text-xs text-muted-foreground">ใช้ {reward.costPoints} ดาว</p><progress aria-label={`เป้าหมาย ${reward.name}`} className="mt-3 h-2 w-full accent-primary" value={Math.min(balance.available, reward.costPoints)} max={reward.costPoints} /><p className="mt-2 text-xs font-medium text-primary">{!reward.isActive ? "ยังไม่เปิดการแลกของรางวัล" : reward.stockQuantity === 0 ? "ของรางวัลหมด" : balance.available >= reward.costPoints ? "ดาวถึงเป้าหมายแล้ว" : `สะสมเพิ่มอีก ${reward.costPoints - balance.available} ดาว`}</p></div>)}</div>}</CardContent>
    </Card>
  );
}
