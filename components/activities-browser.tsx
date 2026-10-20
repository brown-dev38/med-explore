"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  QrCode,
  CheckCircle2,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { ActivityListItem } from "@/types/activity";
import { formatThaiDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLiveActivityData } from "@/components/use-live-activity-data";
import { notifyActivityUpdate } from "@/lib/activity-live";

export function ActivitiesBrowser({
  initial,
  academicYearId,
}: {
  initial: ActivityListItem[];
  academicYearId: string;
}) {
  const { data: items, refresh } = useLiveActivityData(`/api/activities?academicYearId=${encodeURIComponent(academicYearId)}`, initial);
  const [busy, setBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetParticipation, setTargetParticipation] = useState<{
    id: string;
    activityTitle: string;
  } | null>(null);

  async function reload() {
    if (!await refresh()) toast.warning("บันทึกแล้ว กำลังรอเชื่อมต่อเพื่ออัปเดตรายการล่าสุด");
  }

  async function handleUnregister() {
    if (!targetParticipation) return false;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/participations/${targetParticipation.id}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "ยกเลิกการลงทะเบียนไม่สำเร็จ");
        return false;
      }
      toast.success(
        `ยกเลิกการลงทะเบียน ${targetParticipation.activityTitle} เรียบร้อยแล้ว`,
      );
      setTargetParticipation(null);
      await reload();
      notifyActivityUpdate();
      return true;
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function promptUnregister(id: string, activityTitle: string) {
    setTargetParticipation({ id, activityTitle });
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          เช็คอิน / เช็คเอาท์กิจกรรม
        </h1>
        <p className="text-sm text-muted-foreground">
          สแกน QR Code จากหน้าจอผู้จัดเพื่อ Check-in หรือ Check-out กิจกรรม
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-base font-semibold text-foreground">
              ยังไม่มีกิจกรรมที่เปิดรับลงทะเบียนในขณะนี้
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              กิจกรรมใหม่จะแสดงที่นี่เมื่อผู้จัดทำการเปิดรับลงทะเบียน
              โปรดกลับมาตรวจสอบอีกครั้ง
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {items.map((activity) => {
            const mine = activity.myParticipation;
            const checkedIn = Boolean(mine?.checkInAt);
            const checkedOut = Boolean(mine?.checkOutAt);

            return (
              <Card
                key={activity.id}
                className="@container/activity-card h-full transition-all hover:shadow-md"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg font-bold tracking-tight text-foreground line-clamp-2">
                      {activity.title}
                    </CardTitle>
                    {mine ? (
                      <Badge
                        variant="default"
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Sparkles className="mr-1 h-3 w-3" />
                        ลงทะเบียนแล้ว
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        ยังไม่ลงทะเบียน
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatThaiDateTime(activity.startsAt)}
                    </div>
                    <div className="pl-5">
                      ถึง {formatThaiDateTime(activity.endsAt)}
                    </div>
                    {activity.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {activity.location}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 pb-3 flex-1">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      ลงทะเบียน {activity.participantCount} คน
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      เกณฑ์ดาว: {activity.minMinutes} นาที
                    </span>
                  </div>

                  {mine && (mine.checkInAt || mine.checkOutAt) && (
                    <div className="mt-3 space-y-1 rounded-lg bg-muted/50 p-2.5 text-xs">
                      {mine.checkInAt && (
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>เช็คอิน: {formatThaiDateTime(mine.checkInAt)}</span>
                        </div>
                      )}
                      {mine.checkOutAt && (
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>เช็คเอาท์: {formatThaiDateTime(mine.checkOutAt)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="mt-auto flex-col items-stretch gap-3 px-5 py-4 @md/activity-card:flex-row @md/activity-card:items-center @md/activity-card:justify-between">
                  <div className="flex min-w-0 items-center">
                    {!checkedOut ? (
                      <Button
                        nativeButton={false}
                        className="h-auto min-h-10 w-full gap-2 py-2 whitespace-normal"
                        render={
                          <Link href={`/scan?academicYearId=${encodeURIComponent(academicYearId)}`}>
                            <QrCode className="size-4" aria-hidden="true" />
                            {checkedIn
                              ? "สแกน QR Check-out"
                              : "สแกน QR Check-in"}
                          </Link>
                        }
                      />
                    ) : (
                      <Badge
                        variant="default"
                        className="py-1 px-3 bg-emerald-600 gap-1 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        บันทึกเวลาครบแล้ว
                      </Badge>
                    )}
                  </div>

                  {mine && !checkedIn && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => promptUnregister(mine.id, activity.title)}
                      disabled={busy}
                      className="h-auto min-h-10 gap-2 py-2 whitespace-normal text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      ยกเลิกการลงทะเบียน
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog สำหรับยกเลิกการลงทะเบียน */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ยืนยันการยกเลิกการลงทะเบียน"
        description={`คุณต้องการยกเลิกการลงทะเบียนสำหรับกิจกรรม "${targetParticipation?.activityTitle}" หรือไม่?`}
        confirmText="ยกเลิกการลงทะเบียน"
        variant="destructive"
        loading={busy}
        onConfirm={handleUnregister}
      />
    </div>
  );
}
