"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { RewardDto } from "@/types/reward";
import { mutateReward } from "@/lib/reward-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RewardImage } from "@/components/reward-image";
import { MAX_REWARD_IMAGE_BYTES, REWARD_IMAGE_ACCEPT, REWARD_IMAGE_TYPES } from "@/lib/reward-image-rules";

export function RewardManager({ rewards, academicYearId, yearClosed = false }: { rewards: RewardDto[]; academicYearId: string; yearClosed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RewardDto | null>(null);
  const [deleting, setDeleting] = useState<RewardDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", costPoints: "1", stockQuantity: "0", unlimited: false, isActive: !yearClosed });

  useEffect(() => () => { if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!REWARD_IMAGE_TYPES.includes(file.type) || file.size > MAX_REWARD_IMAGE_BYTES || !file.size) {
      setError("กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 2 MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
    setError("");
  }

  function edit(reward: RewardDto | null) {
    setEditing(reward);
    setForm({ name: reward?.name ?? "", description: reward?.description ?? "", costPoints: String(reward?.costPoints ?? 1),
      stockQuantity: String(reward?.stockQuantity ?? 0), unlimited: reward?.stockQuantity === null, isActive: !yearClosed && (reward?.isActive ?? true) });
    setError("");
    setImageFile(null);
    setImagePreview(reward?.imageUrl ?? null);
    setRemoveImage(false);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const data = { name: form.name, description: form.description || null, costPoints: Number(form.costPoints),
      stockQuantity: form.unlimited ? null : Number(form.stockQuantity), isActive: !yearClosed && form.isActive };
    try {
      const payload = {
        ...data, ...(editing ? { expectedStockQuantity: editing.stockQuantity } : { academicYearId }),
      };
      let body: unknown = payload;
      if (imageFile || removeImage) {
        const upload = new FormData();
        upload.set("data", JSON.stringify(payload));
        if (imageFile) upload.set("image", imageFile);
        if (removeImage) upload.set("removeImage", "true");
        body = upload;
      }
      await mutateReward(editing ? `/api/rewards/${editing.id}` : "/api/rewards", editing ? "PATCH" : "POST", body);
      toast.success(editing ? "แก้ไขของรางวัลแล้ว" : "เพิ่มของรางวัลแล้ว");
      setOpen(false);
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      {yearClosed && <p role="status" className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">ปิดปีการศึกษาแล้ว รางวัลทั้งหมดปิดรับแลก สามารถดูและแก้ไขรายละเอียดรางวัลได้</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rewards.length} รางวัล · จำนวนคงเหลือหักส่วนที่จองรออนุมัติแล้ว</p>
        <Button onClick={() => edit(null)}><Plus />เพิ่มของรางวัล</Button>
      </div>
      {rewards.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><Gift className="size-10 text-muted-foreground" /><h2 className="font-semibold">ยังไม่มีของรางวัลในปีนี้</h2><p className="text-sm text-muted-foreground">เพิ่มชื่อรางวัล จำนวนดาวที่ใช้ และจำนวนคงเหลือ เพื่อให้นิสิตเริ่มตั้งเป้าหมาย</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rewards.map((reward) => (
            <Card key={reward.id}>
              <CardContent className="flex h-full flex-col gap-4 p-5">
                <RewardImage src={reward.imageUrl} name={reward.name} />
                <div><Badge variant={!yearClosed && reward.isActive ? "secondary" : "outline"}>{!yearClosed && reward.isActive ? "เปิดให้แลก" : "ปิดให้แลก"}</Badge></div>
                <div><h2 className="break-words text-lg font-semibold">{reward.name}</h2><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{reward.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p></div>
                <dl className="mt-auto grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">ใช้ดาว</dt><dd className="mt-1 font-semibold">{reward.costPoints}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">พร้อมแลก</dt><dd className="mt-1 font-semibold">{reward.stockQuantity ?? "ไม่จำกัด"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">จองรออนุมัติ</dt><dd className="mt-1 font-semibold">{reward.pendingQuantity}</dd></div>
                </dl>
                <div className="flex gap-2 border-t pt-4"><Button variant="outline" size="sm" onClick={() => edit(reward)}><Pencil />แก้ไข</Button><Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => { setDeleting(reward); setError(""); }}><Trash2 />ลบ</Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "แก้ไขของรางวัล" : "เพิ่มของรางวัล"}</DialogTitle><DialogDescription>จำนวนคงเหลือคือจำนวนที่พร้อมแลก ไม่รวมของที่จองรออนุมัติ การแก้ราคาไม่กระทบคำขอเดิม</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="reward-name">ชื่อรางวัล</Label><Input id="reward-name" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="space-y-3">
              <Label htmlFor="reward-image">รูปของรางวัล (ไม่บังคับ)</Label>
              {imagePreview && <RewardImage src={imagePreview} name={form.name || "ตัวอย่าง"} className="aspect-video" />}
              <Input id="reward-image" type="file" accept={REWARD_IMAGE_ACCEPT} disabled={saving} onChange={chooseImage} aria-describedby="reward-image-help" />
              <p id="reward-image-help" className="text-xs text-muted-foreground">JPG, PNG หรือ WebP ขนาดไม่เกิน 2 MB</p>
              {imagePreview && <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setImageFile(null); setImagePreview(null); setRemoveImage(!!editing?.imageUrl); }}>นำรูปออก</Button>}
            </div>
            <div className="space-y-2"><Label htmlFor="reward-description">รายละเอียด</Label><textarea id="reward-description" maxLength={2000} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="reward-cost">จำนวนดาวที่ใช้</Label><Input id="reward-cost" type="number" min={1} max={1000000} required value={form.costPoints} onChange={(event) => setForm({ ...form, costPoints: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="reward-stock">จำนวนที่พร้อมแลก</Label><Input id="reward-stock" type="number" min={0} max={1000000} disabled={form.unlimited} required={!form.unlimited} value={form.stockQuantity} onChange={(event) => setForm({ ...form, stockQuantity: event.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.unlimited} onChange={(event) => setForm({ ...form, unlimited: event.target.checked })} />ไม่จำกัดจำนวน</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!yearClosed && form.isActive} disabled={yearClosed || saving} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />เปิดให้นิสิตแลกของรางวัล</label>
            {yearClosed && <p className="text-xs text-muted-foreground">ไม่สามารถเปิดแลกรางวัลในปีการศึกษาที่ปิดแล้ว</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleting} onOpenChange={(next) => { if (!next) setDeleting(null); }} title="ลบของรางวัล" description={`ลบ “${deleting?.name ?? ""}” ออกจากรายการรางวัลหรือไม่? ประวัติการแลกเดิมจะยังคงอยู่ และลบไม่ได้หากมีคำขอรออนุมัติ`} confirmText="ลบรางวัล" variant="destructive" onConfirm={async () => {
        if (!deleting) return false;
        try { await mutateReward(`/api/rewards/${deleting.id}`, "DELETE"); toast.success("ลบของรางวัลแล้ว"); setDeleting(null); router.refresh(); return true; }
        catch (failure) { toast.error(failure instanceof Error ? failure.message : "ลบไม่สำเร็จ"); return false; }
      }} />
    </div>
  );
}
