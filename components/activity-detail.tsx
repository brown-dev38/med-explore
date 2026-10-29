"use client";

import { useMemo, useRef, useState } from "react";
import { notifyActivityUpdate } from "@/lib/activity-live";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  MapPin,
  QrCode,
  Users,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Star,
  FileSpreadsheet,
} from "lucide-react";
import type {
  ActivityDto,
  ActivityStatus,
  ParticipationDto,
} from "@/types/activity";
import { formatThaiDateTime, localInputToIso } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActivityScheduleEditor } from "@/components/activity-schedule-editor";
import { ActivityPublishButton } from "@/components/activity-publish-button";
import { ActivityQrDisplay } from "@/components/activity-qr-display";
import { useActivityQr } from "@/components/use-activity-qr";
import { StudentExcelImport } from "@/components/green-star-excel-import";
import { useLiveActivityData } from "@/components/use-live-activity-data";

const STATUS_CONFIG: Record<
  ActivityStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "ฉบับร่าง", variant: "secondary" },
  PUBLISHED: { label: "เปิดรับลงทะเบียน", variant: "default" },
  COMPLETED: { label: "สิ้นสุดกิจกรรม", variant: "outline" },
  CANCELLED: { label: "ยกเลิกกิจกรรม", variant: "destructive" },
};

type Candidate = {
  id: string;
  name: string;
  studentCode: string | null;
  email: string;
};

const PARTICIPANTS_PER_PAGE = 10;

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ActivityDetail({
  activity,
  participants,
}: {
  activity: ActivityDto;
  participants: ParticipationDto[];
}) {
  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const { data: rows, refresh: refreshParticipants, failed: participantsRefreshFailed } = useLiveActivityData(`/api/activities/${activity.id}/participations`, participants, 5000);
  const [participantPage, setParticipantPage] = useState(1);
  const [participantSearch, setParticipantSearch] = useState("");
  const participantSearchTerm = participantSearch.trim().toLocaleLowerCase();
  const filteredParticipants = useMemo(() => rows.filter((row) =>
    row.userName.toLocaleLowerCase().includes(participantSearchTerm)
    || (row.studentCode ?? "").toLocaleLowerCase().includes(participantSearchTerm)
  ), [rows, participantSearchTerm]);
  const participantTotalPages = Math.max(1, Math.ceil(filteredParticipants.length / PARTICIPANTS_PER_PAGE));
  const currentParticipantPage = Math.min(participantPage, participantTotalPages);
  const participantOffset = (currentParticipantPage - 1) * PARTICIPANTS_PER_PAGE;
  const visibleParticipants = filteredParticipants.slice(participantOffset, participantOffset + PARTICIPANTS_PER_PAGE);
  const purpose = "CHECK_IN";
  const [ttl, setTtl] = useState("15");
  const { qr, setQr, remaining, restoring: restoringQr, error: qrRestoreError, notice: qrNotice, retryRestore } = useActivityQr(activity.id);
  const [busy, setBusy] = useState(false);

  // Modal Dialogs for Participants
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [participantImportOpen, setParticipantImportOpen] = useState(false);
  const participantRequest = useRef<{ payload: string; id: string } | null>(null);
  const addingParticipants = useRef(false);
  const [bulkTimeOpen, setBulkTimeOpen] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);

  // Bulk Attendance
  const [bulkIn, setBulkIn] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Confirm Dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    description: "",
    confirmText: "ยืนยัน",
    variant: "default" as "default" | "destructive",
    action: async () => {},
  });

  // สรุปสถิติเวลาผู้เข้าร่วม
  const attendanceStats = useMemo(() => {
    let checkedInCount = 0;
    let completedCount = 0;
    let qualifiedCount = 0;

    for (const r of rows) {
      const hasIn = r.attendance.some((a) => a.eventType === "CHECK_IN");
      if (hasIn) checkedInCount++;
      if (r.eligibilityStatus === "APPROVED") completedCount++;
      if (r.yellowStarPoints > 0) qualifiedCount++;
    }

    return {
      total: rows.length,
      checkedIn: checkedInCount,
      completed: completedCount,
      qualified: qualifiedCount,
    };
  }, [rows]);

  async function reloadParticipants(silent = false) {
    const ok = await refreshParticipants();
    if (!silent) {
      if (ok) toast.success("อัปเดตข้อมูลผู้เข้าร่วมล่าสุดแล้ว");
      else toast.warning("โหลดข้อมูลล่าสุดไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ");
    }
  }

  async function changeStatus(next: ActivityStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      setStatus(next);
      toast.success("อัปเดตสถานะกิจกรรมเรียบร้อยแล้ว");
      notifyActivityUpdate();
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  function promptChangeStatus(
    next: ActivityStatus,
    title: string,
    desc: string,
    variant: "default" | "destructive" = "default",
  ) {
    setConfirmConfig({
      title,
      description: desc,
      confirmText: "ยืนยันเปลี่ยนสถานะ",
      variant,
      action: () => changeStatus(next),
    });
    setConfirmOpen(true);
  }

  async function generateQr() {
    if (busy || restoringQr || qrRestoreError) return;
    setBusy(true);
    try {
      const res = await fetch("/api/qr-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          purpose,
          ttlMinutes: Number(ttl) || 15,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "สร้าง QR ไม่สำเร็จ");
        return;
      }
      setQr(json.data);
      toast.success(
        `สร้าง QR ${purpose === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"} สำเร็จ`,
      );
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  }

  function promptCloseQr() {
    if (!qr) return;
    setConfirmConfig({
      title: "ยืนยันการปิด QR Code ทันที",
      description:
        "เมื่อปิด QR แล้ว นิสิตจะไม่สามารถใช้สแกนได้อีก และต้องสร้างใหม่หากต้องการเปิดให้สแกน คุณแน่ใจหรือไม่?",
      confirmText: "ปิด QR ทันที",
      variant: "destructive",
      action: async () => {
        setBusy(true);
        try {
          const response = await fetch(`/api/qr-sessions/${qr.id}`, { method: "DELETE" });
          if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            toast.error(json.message ?? "ปิด QR Code ไม่สำเร็จ");
            return;
          }
          setQr(null);
          toast.success("ปิด QR Code เรียบร้อยแล้ว");
        } catch {
          toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
        } finally {
          setBusy(false);
        }
      },
    });
    setConfirmOpen(true);
  }

  // --- Participant Candidates & Bulk Logic ---
  async function loadCandidates(query?: string) {
    setSearchingCandidates(true);
    try {
      const q = (query !== undefined ? query : candidateQuery).trim();
      const res = await fetch(
        `/api/activities/${activity.id}/participants/candidates${
          q ? `?q=${encodeURIComponent(q)}` : ""
        }`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "ค้นหาไม่สำเร็จ");
        return;
      }
      setCandidates(json.data);
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setSearchingCandidates(false);
    }
  }

  function openCandidateModal() {
    setCandidatesOpen(true);
    setSelectedCandidates([]);
    void loadCandidates("");
  }

  function toggleCandidate(id: string) {
    if (busy || searchingCandidates) return;
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 500 ? [...prev, id] : prev,
    );
  }

  function selectAllCandidates() {
    const displayedIds = new Set(candidates.map((candidate) => candidate.id));
    setSelectedCandidates((selected) => candidates.every((candidate) => selected.includes(candidate.id))
      ? selected.filter((id) => !displayedIds.has(id))
      : [...new Set([...selected, ...displayedIds])].slice(0, 500));
  }

  async function handleAddSelectedCandidates() {
    if (selectedCandidates.length === 0 || addingParticipants.current) return;
    addingParticipants.current = true;
    setBusy(true);
    try {
      const userIds = [...selectedCandidates].sort();
      const payload = JSON.stringify({ activityId: activity.id, userIds });
      if (participantRequest.current?.payload !== payload) participantRequest.current = { payload, id: crypto.randomUUID() };
      const res = await fetch(`/api/activities/${activity.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds, requestId: participantRequest.current.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "เพิ่มผู้ลงทะเบียนไม่สำเร็จ");
        return;
      }
      toast.success(`เพิ่มผู้เข้าร่วม ${json.data.added} คน และให้ดาวสีเหลือง ${json.data.awarded} คนแล้ว${json.data.awarded < json.data.added ? " (บางรายได้รับดาวครบเพดานรายปีแล้ว)" : ""}`);
      participantRequest.current = null;
      setSelectedCandidates([]);
      setCandidatesOpen(false);
      await reloadParticipants();
      notifyActivityUpdate();
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      addingParticipants.current = false;
      setBusy(false);
    }
  }

  function promptBulkSaveTimes() {
    if (!bulkIn) {
      toast.error("กรุณาระบุเวลาเช็คอิน");
      return;
    }
    setConfirmConfig({
      title: `ยืนยันบันทึกเวลาให้ทุกคน (${rows.length} คน)`,
      description: `คุณกำลังจะบันทึกเวลาให้กับผู้ลงทะเบียนทุกคนพร้อมกัน${
        bulkIn ? `\n• เวลาเช็คอิน: ${bulkIn.replace("T", " ")}` : ""
      }\nให้ดาวสีเหลืองอัตโนมัติหลัง QR หมดอายุ ไม่ต้องเช็คเอาท์`,
      confirmText: "บันทึกเวลาให้ทุกคน",
      variant: "default",
      action: async () => {
        setBulkSaving(true);
        try {
          const res = await fetch(
            `/api/activities/${activity.id}/attendance/bulk`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(bulkIn ? { checkInAt: localInputToIso(bulkIn) } : {}),
              }),
            },
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(json.message ?? "บันทึกเวลาไม่สำเร็จ");
            return;
          }
          toast.success(`บันทึกเวลาให้ผู้เข้าร่วม ${json.data.updated} คนแล้ว`);
          setBulkTimeOpen(false);
          await reloadParticipants();
          notifyActivityUpdate();
        } catch {
          toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
        } finally {
          setBulkSaving(false);
        }
      },
    });
    setConfirmOpen(true);
  }

  const copyQrLink = () => {
    if (!qr) return;
    void navigator.clipboard.writeText(qr.scanUrl);
    toast.success("คัดลอกลิงก์สำหรับสแกนแล้ว");
  };

  const copyQrToken = () => {
    if (!qr) return;
    void navigator.clipboard.writeText(qr.token);
    toast.success("คัดลอกรหัส Token แล้ว");
  };

  return (
    <div className="space-y-6">
      {/* ส่วนหัวรายละเอียดกิจกรรม */}
      <Card>
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_CONFIG[status].variant}>
                  {STATUS_CONFIG[status].label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  เช็คอินแล้วรับดาวหลัง QR หมดอายุ
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                {activity.title}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatThaiDateTime(activity.startsAt)} &rarr;{" "}
                  {formatThaiDateTime(activity.endsAt)}
                </span>
                {activity.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {activity.location}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {status === "DRAFT" && activity.status === "DRAFT" && (
                <ActivityScheduleEditor activity={activity} disabled={busy} />
              )}
              {status === "DRAFT" && (
                <ActivityPublishButton
                  endsAt={activity.endsAt}
                  size="default"
                  onPublish={() =>
                    promptChangeStatus(
                      "PUBLISHED",
                      `เปิดรับลงทะเบียน: ${activity.title}`,
                      "เมื่อเปิดรับลงทะเบียนแล้ว นิสิตจะสามารถลงทะเบียนและสแกนเข้างานได้ คุณแน่ใจหรือไม่?",
                    )
                  }
                  disabled={busy}
                />
              )}
              {status === "PUBLISHED" && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      promptChangeStatus(
                        "COMPLETED",
                        `สิ้นสุดกิจกรรม: ${activity.title}`,
                        "คุณต้องการสิ้นสุดกิจกรรมนี้ใช่หรือไม่?",
                      )
                    }
                    disabled={busy}
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    สิ้นสุดกิจกรรม
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      promptChangeStatus(
                        "CANCELLED",
                        `ยกเลิกกิจกรรม: ${activity.title}`,
                        "คุณต้องการยกเลิกกิจกรรมนี้ใช่หรือไม่? กิจกรรมที่ยกเลิกจะไม่สามารถเปิดใหม่ได้",
                        "destructive",
                      )
                    }
                    disabled={busy}
                    className="gap-1.5"
                  >
                    <XCircle className="h-4 w-4" />
                    ยกเลิกกิจกรรม
                  </Button>
                </>
              )}
            </div>
          </div>
          {activity.description && (
            <CardDescription className="text-sm text-foreground/80 pt-3 whitespace-pre-line border-t mt-4">
              {activity.description}
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      {/* QR Code Check-in / Check-out */}
      <Card>
        <CardHeader className="p-6 pb-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold">
              QR Check-in
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            สร้างรหัส QR สด เพื่อให้นิสิตสแกนบันทึกเวลาด้วยกล้องในแอป
            (มีเวลานับถอยหลังตามที่กำหนด)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <div className="flex flex-wrap items-end gap-3 pb-2">
            <div className="space-y-1.5">
              <Label htmlFor="qr-ttl" className="text-xs">
                อายุรหัส (นาที)
              </Label>
              <Input
                id="qr-ttl"
                type="number"
                min={1}
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                disabled={busy}
                className="w-28"
              />
            </div>
            <Button onClick={generateQr} disabled={busy || restoringQr || Boolean(qrRestoreError)} className="gap-2">
              <QrCode className="h-4 w-4" />
              สร้าง QR Code
            </Button>
          </div>

          {restoringQr && <p role="status" className="mt-3 text-sm text-muted-foreground">กำลังตรวจสอบ QR เดิม...</p>}
          {qrRestoreError && <div className="mt-3 space-y-2"><p role="alert" className="text-sm text-destructive">{qrRestoreError}</p><Button variant="outline" size="sm" onClick={retryRestore}>ลองเรียก QR เดิมอีกครั้ง</Button></div>}
          {qrNotice && <p role="status" className="mt-3 text-sm text-muted-foreground">{qrNotice}</p>}
          {qr && (
            <div className="mt-6 flex flex-col items-center gap-6 rounded-xl border border-border bg-muted/30 p-6 sm:flex-row sm:items-start">
              <ActivityQrDisplay key={qr.id} qr={qr} activityTitle={activity.title} remaining={remaining} />
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {qr.purpose === "CHECK_IN" ? "เช็คอิน" : "เช็คเอาท์"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    หมดอายุ: {formatThaiDateTime(qr.expiresAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-base font-bold ${
                      remaining <= 10
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    เหลือเวลา: {formatRemaining(remaining)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyQrLink}
                    className="gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    คัดลอกลิงก์
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyQrToken}
                    className="gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    คัดลอกรหัสโทเคน
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={promptCloseQr}
                    disabled={busy}
                  >
                    ปิด QR ตอนนี้
                  </Button>
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400">
                  เคล็ดลับ: สามารถฉาย QR ขึ้นจอ projector
                  หรือเปิดลิงก์บนเครื่องผู้เข้าร่วมเพื่อทดสอบได้ทันที
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ผู้ลงทะเบียนทั่วไป (ดาวเหลือง) */}
      <Tabs defaultValue="participants" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="participants" className="gap-2">
            <Users className="h-4 w-4" />
            <span>ผู้ลงทะเบียนทั่วไป</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {rows.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: ผู้ลงทะเบียนทั่วไป */}
        <TabsContent value="participants" className="space-y-4">
          {/* สรุปภาพรวมเวลาผู้เข้าร่วม */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5 bg-muted/30">
              <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <Users className="h-3.5 w-3.5 text-primary" />
                ผู้ลงทะเบียนทั้งหมด
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {attendanceStats.total} <span className="text-xs font-normal text-muted-foreground">คน</span>
              </p>
            </Card>
            <Card className="p-3.5 bg-muted/30">
              <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" />
                เช็คอินแล้ว
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {attendanceStats.checkedIn} <span className="text-xs font-normal text-muted-foreground">คน</span>
              </p>
            </Card>
            <Card className="p-3.5 bg-muted/30">
              <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                ประเมินหลัง QR หมดอายุแล้ว
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {attendanceStats.completed} <span className="text-xs font-normal text-muted-foreground">คน</span>
              </p>
            </Card>
            <Card className="p-3.5 bg-muted/30">
              <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                ได้รับดาวสีเหลืองแล้ว
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {attendanceStats.qualified} <span className="text-xs font-normal text-muted-foreground">คน</span>
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-6 pb-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      ตารางสรุปเวลาผู้เข้าร่วม ({rows.length} คน)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      เช็คอินอย่างเดียว รับ 1 ดาวสีเหลืองอัตโนมัติหลัง QR หมดอายุ ไม่กำหนดนาทีขั้นต่ำ
                      <span className="mt-1 block" role="status">
                        {participantsRefreshFailed ? "เชื่อมต่อข้อมูลล่าสุดไม่ได้ กำลังลองใหม่อัตโนมัติ" : "อัปเดตรายชื่อและเวลาอัตโนมัติทุก 5 วินาที"}
                      </span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setParticipantImportOpen(true)} disabled={busy || (status !== "PUBLISHED" && status !== "COMPLETED")} className="gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" />นำเข้า Excel</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openCandidateModal}
                    disabled={busy || (status !== "PUBLISHED" && status !== "COMPLETED")}
                    className="gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    เพิ่มผู้เข้าร่วม
                  </Button>
                  {/* <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkTimeOpen(true)}
                    className="gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    ตั้งเวลาให้ทุกคน
                  </Button> */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void reloadParticipants()}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    รีเฟรช
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <div className="space-y-2 px-6 pb-4">
                <Label htmlFor="participant-name-search">ค้นหาชื่อหรือรหัสนิสิต</Label>
                <Input
                  id="participant-name-search"
                  type="search"
                  placeholder="พิมพ์ชื่อ นามสกุล หรือรหัสนิสิต"
                  value={participantSearch}
                  onChange={(event) => { setParticipantSearch(event.target.value); setParticipantPage(1); }}
                  className="sm:max-w-sm"
                />
              </div>
              <div className="h-[720px] [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:[scrollbar-gutter:stable]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>ชื่อ-นามสกุล</TableHead>
                    <TableHead>รหัสนิสิต</TableHead>
                    <TableHead>เวลาเช็คอิน</TableHead>
                    <TableHead>ผลการเช็คอิน</TableHead>
                    <TableHead>ดาวสีเหลือง</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParticipants.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-28 text-center text-muted-foreground"
                      >
                        {rows.length === 0 ? "ยังไม่มีผู้ลงทะเบียนกิจกรรมนี้" : "ไม่พบผู้เข้าร่วมที่ตรงกับคำค้นหา"}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleParticipants.map((row) => {
                    const checkIn = row.attendance.find(
                      (r) => r.eventType === "CHECK_IN",
                    );
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-semibold text-foreground">
                          {row.userName}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {row.studentCode ?? "-"}
                        </TableCell>
                        <TableCell>
                          {checkIn ? (
                            <div className="flex items-center gap-1.5 text-xs text-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{formatThaiDateTime(checkIn.occurredAt)}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                {checkIn.method === "QR" ? "QR" : "ผู้จัด"}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{row.reviewNote ?? (checkIn ? "เช็คอินแล้ว รอ QR หมดอายุ" : "ยังไม่เช็คอิน")}</span></TableCell>
                        <TableCell>
                          {row.yellowStarPoints > 0 ? (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className="gap-1 border-amber-300 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold text-xs py-0.5 px-2"
                              >
                                <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                                1 ดาวสีเหลือง
                              </Badge>
                              {row.reviewNote && (
                                <p
                                  className="text-[10px] text-muted-foreground max-w-[180px] truncate"
                                  title={row.reviewNote}
                                >
                                  {row.reviewNote}
                                </p>
                              )}
                            </div>
                          ) : row.reviewNote ? (
                            <div className="space-y-0.5">
                              <span className="text-xs text-muted-foreground">ยังไม่ได้ดาว</span>
                              <p
                                className="text-[10px] text-muted-foreground max-w-[180px] truncate"
                                title={row.reviewNote}
                              >
                                {row.reviewNote}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  แสดง {filteredParticipants.length ? participantOffset + 1 : 0}–{participantOffset + visibleParticipants.length} จาก {filteredParticipants.length} ราย (หน้าละ {PARTICIPANTS_PER_PAGE} ราย)
                  {participantSearchTerm && ` จากผู้เข้าร่วมทั้งหมด ${rows.length} ราย`}
                </p>
                <nav aria-label="หน้ารายชื่อผู้เข้าร่วม" className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={currentParticipantPage === 1} onClick={() => setParticipantPage(currentParticipantPage - 1)}>
                    ก่อนหน้า
                  </Button>
                  <span className="text-sm text-muted-foreground">หน้า {currentParticipantPage} / {participantTotalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentParticipantPage === participantTotalPages} onClick={() => setParticipantPage(currentParticipantPage + 1)}>
                    ถัดไป
                  </Button>
                </nav>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal เพิ่มผู้เข้าร่วม (Participants Modal) */}
      <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้เข้าร่วมกิจกรรม</DialogTitle>
            <DialogDescription>
              เลือกเฉพาะนิสิตที่ยังไม่ได้ลงทะเบียน ระบบบันทึกเช็คอินและให้ดาวสีเหลืองทันทีตามเพดาน 12 ดาวต่อปี
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={candidateQuery}
                onChange={(e) => setCandidateQuery(e.target.value)}
                placeholder="ค้นหาชื่อผู้ใช้, รหัสนิสิต หรือชื่อ-นามสกุล..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadCandidates();
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => void loadCandidates()}
                disabled={searchingCandidates}
              >
                ค้นหา
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                พบ {candidates.length} คน (เลือกแล้ว {selectedCandidates.length}/500 คน)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllCandidates}
                  disabled={busy || searchingCandidates || !candidates.length}
                  className="hover:underline text-primary"
                >
                  {candidates.length > 0 && candidates.every((candidate) => selectedCandidates.includes(candidate.id)) ? "ยกเลิกเลือกทั้งหมดที่แสดง" : "เลือกทั้งหมดที่แสดง"}
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() => setSelectedCandidates([])}
                  className="hover:underline text-muted-foreground"
                >
                  ล้างที่เลือก
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {candidates.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {searchingCandidates
                    ? "กำลังค้นหารายชื่อ..."
                    : "ไม่พบนิสิตที่ยังไม่ลงทะเบียน"}
                </div>
              ) : (
                candidates.map((c) => {
                  const isChecked = selectedCandidates.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCandidate(c.id)}
                      className={`flex items-center justify-between p-3 text-sm cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={busy || searchingCandidates || (!isChecked && selectedCandidates.length >= 500)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                        />
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.studentCode
                              ? `รหัส ${c.studentCode} · `
                              : ""}
                            {c.email}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCandidatesOpen(false)}
                disabled={busy}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                onClick={handleAddSelectedCandidates}
                disabled={busy || selectedCandidates.length === 0}
              >
                เพิ่มที่เลือกและให้ดาว ({selectedCandidates.length})
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={participantImportOpen} onOpenChange={setParticipantImportOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="sr-only"><DialogTitle>นำเข้าผู้เข้าร่วมจาก Excel</DialogTitle><DialogDescription>{activity.title} · บันทึกเช็คอินและให้ดาวสีเหลืองทันที</DialogDescription></DialogHeader>
          <StudentExcelImport target={{ mode: "participants", academicYearId: activity.academicYearId, activityId: activity.id }} targetLabel={activity.title} disabled={busy || (status !== "PUBLISHED" && status !== "COMPLETED")} onImported={async () => { await reloadParticipants(true); notifyActivityUpdate(); }} />
        </DialogContent>
      </Dialog>

      {/* Modal บันทึกเวลาให้ทุกคน (Bulk) */}
      <Dialog open={bulkTimeOpen} onOpenChange={setBulkTimeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ตั้งเวลาให้ทุกคน ({rows.length} คน)</DialogTitle>
            <DialogDescription>
              กำหนดเวลาเช็คอินให้กับผู้เข้าร่วมทั้งหมดพร้อมกัน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-in">เวลาเช็คอิน</Label>
              <Input
                id="bulk-in"
                type="datetime-local"
                value={bulkIn}
                onChange={(e) => setBulkIn(e.target.value)}
                disabled={bulkSaving}
              />
            </div>
            <p className="text-xs text-muted-foreground">บันทึกเช็คอินให้ทุกคน ดาวสีเหลืองจะประเมินหลัง QR หมดอายุ หากไม่มี QR จะประเมินหลังสิ้นสุดกิจกรรม</p>
            <DialogFooter className="mt-4 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkTimeOpen(false)}
                disabled={bulkSaving}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                onClick={promptBulkSaveTimes}
                disabled={bulkSaving || !bulkIn}
              >
                บันทึกเวลาให้ทุกคน
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reusable Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        variant={confirmConfig.variant}
        loading={busy || bulkSaving}
        onConfirm={async () => {
          setConfirmOpen(false);
          await confirmConfig.action();
        }}
      />
    </div>
  );
}
