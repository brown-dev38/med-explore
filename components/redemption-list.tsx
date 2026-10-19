"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { type RedemptionDto, type RedemptionStatus, redemptionLabels } from "@/types/reward";
import { mutateReward } from "@/lib/reward-client";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Action = { record: RedemptionDto; status: Exclude<RedemptionStatus, "PENDING"> };
export function RedemptionList({ records, staff }: { records: RedemptionDto[]; staff: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function choose(record: RedemptionDto, status: Action["status"]) { setAction({ record, status }); setNote(""); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || saving) return;
    setSaving(true); setError("");
    try {
      await mutateReward(`/api/reward-redemptions/${action.record.id}`, "PATCH", { status: action.status, note });
      toast.success("บันทึกสถานะคำขอแล้ว"); setAction(null); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  return (
    <>
      {records.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground"><Gift className="mx-auto mb-3 size-10" />ยังไม่มีคำขอในรายการนี้</CardContent></Card> : (
        <div className="space-y-3">
          {records.map((record) => (
            <Card key={record.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h2 className="break-words font-semibold">{record.rewardName}</h2>{staff && <p className="mt-1 text-sm">{record.studentName} <span className="text-muted-foreground">{record.studentCode}</span></p>}<p className="mt-1 text-xs text-muted-foreground">คำขอ #{record.id} · {record.costPoints} ดาว · {formatThaiDateTime(record.requestedAt)}</p></div>
                  <Badge variant={record.status === "REJECTED" ? "destructive" : record.status === "PENDING" ? "outline" : "secondary"}>{redemptionLabels[record.status]}</Badge>
                </div>
                {record.note && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm">หมายเหตุ: {record.note}</p>}
                {record.reviewedAt && <p className="text-xs text-muted-foreground">พิจารณาเมื่อ {formatThaiDateTime(record.reviewedAt)}</p>}
                {(record.status === "REJECTED" || record.status === "CANCELLED") && <p className="text-xs text-muted-foreground">คืนดาวและจำนวนรางวัลที่จองแล้ว</p>}
                <div className="flex flex-wrap gap-2">
                  {staff && record.status === "PENDING" && <><Button size="sm" onClick={() => choose(record, "APPROVED")}>อนุมัติ</Button><Button size="sm" variant="outline" onClick={() => choose(record, "REJECTED")}>ไม่อนุมัติ</Button></>}
                  {staff && record.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => choose(record, "COMPLETED")}>ยืนยันส่งมอบรางวัลแล้ว</Button>}
                  {!staff && record.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => choose(record, "CANCELLED")}>ยกเลิกคำขอ</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!action} onOpenChange={(next) => { if (!saving && !next) setAction(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action ? redemptionLabels[action.status] : "พิจารณาคำขอ"}</DialogTitle><DialogDescription>{action?.record.rewardName} · {action?.record.costPoints} ดาว{action?.status === "REJECTED" || action?.status === "CANCELLED" ? " · จะคืนดาวและจำนวนรางวัลที่จอง" : action?.status === "APPROVED" ? " · ยืนยันหักดาวที่จองไว้ และให้นิสิตรับรางวัลได้" : " · ยืนยันว่าได้ส่งมอบรางวัลให้นิสิตแล้ว"}</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="redemption-note">{action?.status === "REJECTED" ? "เหตุผลที่ไม่อนุมัติ (จำเป็น)" : "หมายเหตุ (ถ้ามี)"}</Label><textarea id="redemption-note" rows={3} maxLength={1000} required={action?.status === "REJECTED"} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setAction(null)}>ปิด</Button><Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "ยืนยัน"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
