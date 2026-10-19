import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gift, ClipboardCheck } from "lucide-react";
import { requireAdminAccess, requireOrganizerAccess } from "@/lib/dal";
import { getStudentDashboardContext } from "@/lib/student-dashboard";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentSearchParams } from "@/lib/student-activity-filters";
import { rewardCatalog, rewardBalance, redemptionHistory } from "@/lib/rewards";
import { redemptionLabels, type RedemptionStatus } from "@/types/reward";
import { StudentYearSelector } from "@/components/student-year-selector";
import { RewardManager } from "@/components/reward-manager";
import { RewardCatalog } from "@/components/reward-catalog";
import { RedemptionList } from "@/components/redemption-list";

type PageProps = { area: "admin" | "organizer" | "dashboard"; searchParams: Promise<StudentSearchParams> };

export function RewardsPage(props: PageProps) {
  return <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดของรางวัล...</p>}><RewardsContent {...props} /></Suspense>;
}
export function RedemptionsPage(props: PageProps) {
  return <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดคำขอแลกรางวัล...</p>}><RedemptionsContent {...props} /></Suspense>;
}

async function context({ area, searchParams }: PageProps) {
  const staff = area !== "dashboard";
  const user = area === "admin" ? await requireAdminAccess() : area === "organizer" ? await requireOrganizerAccess() : (await getStudentDashboardContext()).user;
  const year = await getStudentYearContext(searchParams);
  return { staff, user, ...year };
}

async function RewardsContent(props: PageProps) {
  const { area } = props;
  const { staff, user, years, selectedYear } = await context(props);
  const [rewards, balance] = selectedYear ? await Promise.all([
    rewardCatalog(BigInt(selectedYear.id)),
    staff ? Promise.resolve({ balance: 0, available: 0, reserved: 0 }) : rewardBalance(BigInt(user.id), BigInt(selectedYear.id)),
  ]) : [[], { balance: 0, available: 0, reserved: 0 }];
  const history = `/${area}/redemptions${selectedYear ? `?academicYearId=${selectedYear.id}` : ""}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 flex items-center gap-2 text-xs font-medium text-primary"><Gift className="size-4" />MEDEXPLORE REWARDS</p><h1 className="text-2xl font-bold tracking-tight">{staff ? "จัดการของรางวัล" : "เป้าหมายและแลกของรางวัล"}</h1><p className="mt-2 text-sm text-muted-foreground">{staff ? "กำหนดดาวที่ใช้แลกและจำนวนคงเหลือของแต่ละรางวัล แยกตามปีการศึกษา" : "เปลี่ยนดาวจากการเข้าร่วมและช่วยงานให้เป็นรางวัลที่คุณตั้งใจ"}</p></div>
        <Link href={history} className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted"><ClipboardCheck className="size-4" />{staff ? "พิจารณาคำขอแลก" : "ประวัติและสถานะคำขอ"}</Link>
      </div>
      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={`/${area}/rewards`} />
      {!selectedYear ? <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">ยังไม่มีปีการศึกษา กรุณาติดต่อผู้ดูแลเพื่อเริ่มใช้งาน</p> : staff ? <RewardManager key={selectedYear.id} rewards={rewards} academicYearId={selectedYear.id} yearClosed={selectedYear.status === "CLOSED"} /> : <RewardCatalog key={selectedYear.id} rewards={rewards} balance={balance} canRedeem={selectedYear.status === "ACTIVE"} yearClosed={selectedYear.status === "CLOSED"} />}
    </div>
  );
}

async function RedemptionsContent(props: PageProps) {
  const { area } = props;
  const { staff, user, years, selectedYear, searchParams } = await context(props);
  const rawStatus = searchParams.status ?? (staff ? "PENDING" : "ALL");
  if (typeof rawStatus !== "string" || (rawStatus !== "ALL" && !Object.keys(redemptionLabels).includes(rawStatus))) notFound();
  const status = rawStatus === "ALL" ? undefined : rawStatus as RedemptionStatus;
  const rawPage = typeof searchParams.page === "string" && /^\d{1,6}$/.test(searchParams.page) ? Math.max(1, Number(searchParams.page)) : 1;
  const result = selectedYear ? await redemptionHistory(BigInt(selectedYear.id), { ...(staff ? {} : { userId: BigInt(user.id) }), status, page: rawPage }) : { records: [], total: 0, page: 1, totalPages: 1 };
  const href = (value: string, page = 1) => `/${area}/redemptions?${new URLSearchParams({ ...(selectedYear ? { academicYearId: selectedYear.id } : {}), status: value, page: String(page) })}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">{staff ? "พิจารณาคำขอแลกรางวัล" : "ประวัติการแลกรางวัล"}</h1><p className="mt-2 text-sm text-muted-foreground">{staff ? "อนุมัติหรือระบุเหตุผลที่ไม่อนุมัติ และบันทึกเมื่อส่งมอบรางวัลแล้ว" : "ติดตามผลอนุมัติ และยกเลิกคำขอที่ยังรออนุมัติได้"}</p></div><Link href={`/${area}/rewards${selectedYear ? `?academicYearId=${selectedYear.id}` : ""}`} className="text-sm font-medium text-primary underline underline-offset-4">{staff ? "จัดการของรางวัล" : "เลือกของรางวัล"}</Link></div>
      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={`/${area}/redemptions`} />
      <nav aria-label="กรองสถานะการแลก" className="flex flex-wrap gap-2">
        {Object.entries({ ALL: "ทั้งหมด", ...redemptionLabels }).map(([value, label]) => <Link key={value} href={href(value)} aria-current={rawStatus === value ? "page" : undefined} className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${rawStatus === value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>{label}</Link>)}
      </nav>
      <p className="text-sm text-muted-foreground">{result.total} คำขอ</p>
      <RedemptionList records={result.records} staff={staff} />
      {result.totalPages > 1 && <nav aria-label="หน้ารายการคำขอ" className="flex items-center justify-between gap-3 text-sm">{result.page > 1 ? <Link className="text-primary underline underline-offset-4" href={href(rawStatus, result.page - 1)}>ก่อนหน้า</Link> : <span />}<span>หน้า {result.page} / {result.totalPages}</span>{result.page < result.totalPages ? <Link className="text-primary underline underline-offset-4" href={href(rawStatus, result.page + 1)}>ถัดไป</Link> : <span />}</nav>}
    </div>
  );
}
