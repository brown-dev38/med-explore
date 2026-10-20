"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Search,
  Pencil,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  Shield,
  GraduationCap,
  CalendarCheck,
  Trash2,
  KeyRound,
} from "lucide-react";
import { ROLES } from "@/lib/permissions";
import type { UserDto, UserListResult } from "@/types/user";
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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { UserRoleSelector } from "@/components/user-role-selector";
import { ResetUserPasswordDialog } from "@/components/reset-user-password-dialog";

const ROLE_OPTIONS = [ROLES.ADMIN, ROLES.ORGANIZER, ROLES.STUDENT];
const PAGE_SIZE = 10;

type EditState = {
  firstname: string;
  lastname: string;
  studentCode: string;
  isActive: boolean;
  role: string;
};

export function UsersTable({
  initialResult,
  currentUserId,
  canDeleteUsers,
  canResetPasswords = false,
}: {
  initialResult: UserListResult;
  currentUserId: string;
  canDeleteUsers: boolean;
  canResetPasswords?: boolean;
}) {
  const [result, setResult] = useState(initialResult);
  const [formQ, setFormQ] = useState("");
  const [formRole, setFormRole] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<UserDto | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserDto | null>(null);
  const accountStatusLockReason = editing?.id === currentUserId
    ? "ไม่สามารถปิดใช้งานบัญชีที่กำลังล็อกอินอยู่ได้"
    : editing?.isActive && editing.roles.includes(ROLES.ADMIN) && result.activeAdminCount <= 1
      ? "ไม่สามารถปิดใช้งาน ADMIN คนสุดท้ายที่เปิดใช้งานได้"
      : null;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: "",
    description: "",
    action: async (): Promise<boolean> => false,
  });

  async function fetchUsers(
    nextPage: number,
    nextQ: string,
    nextRole: string,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      if (nextQ) params.set("q", nextQ);
      if (nextRole) params.set("role", nextRole);

      const res = await fetch(`/api/users?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message ?? "โหลดข้อมูลไม่สำเร็จ");
        return;
      }
      setResult(json.data);
    } catch {
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextQ = formQ.trim();
    setAppliedQ(nextQ);
    setAppliedRole(formRole);
    void fetchUsers(1, nextQ, formRole);
  }

  function goToPage(nextPage: number) {
    void fetchUsers(nextPage, appliedQ, appliedRole);
  }

  async function performDelete() {
    if (!deleteTarget || deleting || !canDeleteUsers) return false;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(json.message ?? "ลบผู้ใช้งานไม่สำเร็จ");
        return false;
      }
      toast.success(`ลบผู้ใช้งาน ${deleteTarget.username} เรียบร้อยแล้ว`);
      const nextPage = Math.min(result.page, Math.max(1, Math.ceil((result.total - 1) / PAGE_SIZE)));
      setResult((current) => ({ ...current, items: current.items.filter((user) => user.id !== deleteTarget.id), total: Math.max(0, current.total - 1) }));
      await fetchUsers(nextPage, appliedQ, appliedRole);
      return true;
    } catch {
      setDeleteError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่");
      return false;
    } finally { setDeleting(false); }
  }

  function openEdit(user: UserDto) {
    setSaveError(null);
    setEditing(user);
    setEdit({
      firstname: user.firstname ?? "",
      lastname: user.lastname ?? "",
      studentCode: user.studentCode ?? "",
      isActive: user.isActive,
      role: user.roles.length === 1 ? user.roles[0] : "",
    });
  }

  async function performSave() {
    if (!editing || !edit || !edit.role || saving) return false;
    if (accountStatusLockReason && edit.isActive !== editing.isActive) {
      toast.error(accountStatusLockReason);
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname: edit.firstname,
          lastname: edit.lastname,
          studentCode: edit.studentCode,
          isActive: edit.isActive,
          roles: [edit.role],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.message ?? "บันทึกไม่สำเร็จ";
        setSaveError(message);
        toast.error(message);
        return false;
      }
      toast.success("บันทึกข้อมูลผู้ใช้งานเรียบร้อยแล้ว");
      setEditing(null);
      setEdit(null);
      await fetchUsers(result.page, appliedQ, appliedRole);
      return true;
    } catch {
      setSaveError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      toast.error("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleSaveCheck(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || !edit || saving) return;
    if (!edit.role) { toast.error("กรุณาเลือกบทบาทเพียงหนึ่งบทบาท"); return; }

    // ตรวจสอบกรณีเปลี่ยนสถานะเป็นปิดใช้งาน หรือถอดบทบาท ADMIN
    if (editing.isActive && !edit.isActive) {
      setConfirmConfig({
        title: `ยืนยันการระงับการใช้งานบัญชี ${editing.username}`,
        description:
          "เมื่อปิดการใช้งาน ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดใช้งานอีกครั้ง คุณต้องการดำเนินการต่อหรือไม่?",
        action: performSave,
      });
      setConfirmOpen(true);
      return;
    }

    if (
      editing.roles.length !== 1 || editing.roles[0] !== edit.role
    ) {
      setConfirmConfig({
        title: `ยืนยันเปลี่ยนบทบาทของ ${editing.username}`,
        description:
          `บทบาทใหม่: ${edit.role}\nสิทธิ์ใหม่จะมีผลเมื่อผู้ใช้เข้าสู่ระบบอีกครั้ง คุณต้องการบันทึกหรือไม่?`,
        action: performSave,
      });
      setConfirmOpen(true);
      return;
    }

    void performSave();
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case ROLES.ADMIN:
        return <Shield className="mr-1 h-3 w-3 text-indigo-500" />;
      case ROLES.ORGANIZER:
        return <CalendarCheck className="mr-1 h-3 w-3 text-sky-500" />;
      default:
        return <GraduationCap className="mr-1 h-3 w-3 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          จัดการผู้ใช้งาน
        </h1>
        <p className="text-sm text-muted-foreground">
          ค้นหา ตรวจสอบบทบาท มอบหมายสิทธิ์ และจัดการสถานะบัญชีผู้ใช้ในระบบ
        </p>
        </div>
        <CreateUserDialog onCreated={async () => {
          setFormQ(""); setFormRole(""); setAppliedQ(""); setAppliedRole("");
          await fetchUsers(1, "", "");
        }} />
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="search-q" className="text-xs">
                ค้นหาผู้ใช้งาน
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-q"
                  value={formQ}
                  onChange={(e) => setFormQ(e.target.value)}
                  placeholder="ชื่อผู้ใช้, รหัสนิสิต, อีเมล หรือชื่อ-นามสกุล..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:w-48">
              <Label htmlFor="role-filter" className="text-xs">
                กรองตามบทบาท
              </Label>
              <select
                id="role-filter"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">ทั้งหมด</option>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={loading} className="gap-2">
              <Search className="h-4 w-4" />
              ค้นหา
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-base font-semibold">
            รายชื่อผู้ใช้งานทั้งหมด ({result.total} รายการ)
          </CardTitle>
          <CardDescription className="text-xs">
            หน้า {result.page} จาก {result.totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อ-นามสกุล / รหัสนิสิต</TableHead>
                <TableHead>บัญชีผู้ใช้</TableHead>
                <TableHead>บทบาท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    ไม่พบผู้ใช้งานที่ตรงตามเงื่อนไข
                  </TableCell>
                </TableRow>
              )}
              {result.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-semibold text-foreground">
                      {[user.firstname, user.lastname]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.studentCode
                        ? `รหัส ${user.studentCode}`
                        : "ไม่มีรหัสนิสิต"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">
                      {user.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">
                          ไม่มีบทบาท
                        </span>
                      )}
                      {user.roles.map((r) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className="inline-flex items-center text-xs"
                        >
                          {getRoleIcon(r)}
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                        <UserCheck className="h-3 w-3" />
                        ใช้งาน
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <UserX className="h-3 w-3" />
                        ปิดใช้งาน
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(user)}
                      disabled={deleting || saving}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      แก้ไข
                    </Button>
                    {canResetPasswords && user.roles.length === 1 && (user.roles[0] === ROLES.STUDENT || user.roles[0] === ROLES.ORGANIZER) && (
                      <Button variant="outline" size="sm" disabled={deleting || saving || loading} aria-label={`เปลี่ยนรหัสผ่าน ${user.username}`} onClick={() => setPasswordTarget(user)}>
                        <KeyRound className="size-3.5" />รหัสผ่าน
                      </Button>
                    )}
                    {canDeleteUsers && (
                      <Button variant="destructive" size="sm" aria-label={`ลบผู้ใช้ ${user.username}`}
                        disabled={user.id === currentUserId || deleting || saving || loading}
                        title={user.id === currentUserId ? "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" : "ลบผู้ใช้งาน"}
                        onClick={() => { setDeleteError(null); setDeleteTarget(user); }}>
                        <Trash2 className="size-3.5" />ลบ
                      </Button>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            แสดงหน้า {result.page} จาก {result.totalPages} (รวม {result.total}{" "}
            คน)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={result.page <= 1 || loading}
              onClick={() => goToPage(result.page - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={result.page >= result.totalPages || loading}
              onClick={() => goToPage(result.page + 1)}
              className="gap-1"
            >
              ถัดไป
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal แก้ไขผู้ใช้งาน */}
      {passwordTarget && <ResetUserPasswordDialog key={passwordTarget.id} user={passwordTarget} onClose={() => setPasswordTarget(null)} />}
      <Dialog
        open={Boolean(editing && edit)}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditing(null);
            setEdit(null);
          }
        }}
      >
        <DialogContent showCloseButton={!saving} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลผู้ใช้งาน</DialogTitle>
            <DialogDescription>
              {editing?.username} · {editing?.email}
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <form onSubmit={handleSaveCheck} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-firstname">ชื่อจริง</Label>
                  <Input
                    id="edit-firstname"
                    value={edit.firstname}
                    onChange={(e) =>
                      setEdit({ ...edit, firstname: e.target.value })
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lastname">นามสกุล</Label>
                  <Input
                    id="edit-lastname"
                    value={edit.lastname}
                    onChange={(e) =>
                      setEdit({ ...edit, lastname: e.target.value })
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-student-code">รหัสนิสิต</Label>
                <Input
                  id="edit-student-code"
                  value={edit.studentCode}
                  onChange={(e) =>
                    setEdit({ ...edit, studentCode: e.target.value })
                  }
                  placeholder="เช่น 6601000001 (สำหรับนิสิต)"
                  disabled={saving}
                />
              </div>

              <UserRoleSelector name="edit-user-role" value={edit.role}
                onChange={(role) => setEdit({ ...edit, role })} disabled={saving} />

              <div className="pt-2">
                <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    id="edit-is-active"
                    checked={edit.isActive}
                    onChange={(e) =>
                      setEdit({ ...edit, isActive: e.target.checked })
                    }
                    disabled={saving || Boolean(accountStatusLockReason)}
                    aria-describedby={accountStatusLockReason ? "account-status-lock-hint" : undefined}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  เปิดใช้งานบัญชี (สามารถเข้าสู่ระบบได้)
                </label>
                {accountStatusLockReason && <p id="account-status-lock-hint" className="mt-2 text-xs text-muted-foreground">{accountStatusLockReason}</p>}
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setEdit(null);
                  }}
                  disabled={saving}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog สำหรับกรณีสำคัญ เช่น ปิดบัญชี หรือ ปลด ADMIN */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteError(null); } }}
        title={`ยืนยันลบผู้ใช้ ${deleteTarget?.username ?? ""}`}
        description={<>
          <span>บัญชี {deleteTarget?.email} จะถูกลบถาวรและใช้งานต่อไม่ได้ หากมีประวัติกิจกรรมหรือการทำรายการ ระบบจะไม่ลบและให้ปิดใช้งานบัญชีแทนเพื่อเก็บประวัติ</span>
          {deleteError && <span role="alert" className="mt-3 block font-medium text-destructive">{deleteError}</span>}
        </>}
        confirmText="ลบผู้ใช้งาน"
        variant="destructive"
        loading={deleting}
        onConfirm={performDelete}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={<>
          <span>{confirmConfig.description}</span>
          {saveError && <span role="alert" className="mt-3 block font-medium text-destructive">{saveError}</span>}
        </>}
        confirmText="ยืนยันบันทึก"
        variant="destructive"
        loading={saving}
        onConfirm={confirmConfig.action}
      />
    </div>
  );
}
