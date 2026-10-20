export const ANNUAL_REPORTS = [
  { id: "all", label: "รายงานทั้งหมด (7 ชีต)" },
  { id: "overview", label: "ภาพรวมประจำปี" },
  { id: "activities", label: "สรุปรายกิจกรรม" },
  { id: "students", label: "สรุปรายบุคคล" },
  { id: "attendance", label: "รายละเอียดการเข้าร่วม" },
  { id: "stars", label: "ประวัติรายการดาว" },
  { id: "redemptions", label: "การแลกรางวัล" },
  { id: "issues", label: "รายการที่ต้องตรวจสอบ" },
] as const;

export type AnnualReportKind = typeof ANNUAL_REPORTS[number]["id"];
export type AnnualReportFilters = {
  academicYearId: string;
  report: AnnualReportKind;
  activityStatus: string;
  starType: string;
  redemptionStatus: string;
};

export const ACTIVITY_REPORT_STATUSES = { DRAFT: "ฉบับร่าง", PUBLISHED: "เปิดรับลงทะเบียน", COMPLETED: "สิ้นสุดกิจกรรม", CANCELLED: "ยกเลิกกิจกรรม" };
export const STAR_REPORT_TYPES = { YELLOW: "ดาวสีเหลือง", GREEN: "ดาวสีเขียว", ADJUSTMENT: "ปรับยอด / แลกรางวัล" };
export const REDEMPTION_REPORT_STATUSES = { PENDING: "รอพิจารณา", APPROVED: "อนุมัติ รอรับของ", COMPLETED: "รับของแล้ว", CANCELLED: "ยกเลิก", REJECTED: "ไม่อนุมัติ" };

export class AnnualReportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function parseAnnualReportFilters(params: URLSearchParams): AnnualReportFilters {
  const keys = ["academicYearId", "report", "activityStatus", "starType", "redemptionStatus"];
  if ([...params.keys()].some((key) => !keys.includes(key) || params.getAll(key).length > 1)) {
    throw new AnnualReportError("ตัวกรองรายงานไม่ถูกต้อง");
  }
  const academicYearId = params.get("academicYearId") ?? "";
  if (!/^[1-9]\d{0,18}$/.test(academicYearId) || BigInt(academicYearId) > BigInt("9223372036854775807")) {
    throw new AnnualReportError("กรุณาเลือกปีการศึกษาที่ถูกต้อง");
  }
  const report = params.get("report") ?? "all";
  if (!ANNUAL_REPORTS.some((item) => item.id === report)) throw new AnnualReportError("ไม่พบประเภทรายงาน");
  const activityStatus = params.get("activityStatus") ?? "all";
  const starType = params.get("starType") ?? "all";
  const redemptionStatus = params.get("redemptionStatus") ?? "all";
  if ((activityStatus !== "all" && (!Object.hasOwn(ACTIVITY_REPORT_STATUSES, activityStatus) || !["activities", "attendance"].includes(report))) ||
      (starType !== "all" && (!Object.hasOwn(STAR_REPORT_TYPES, starType) || report !== "stars")) ||
      (redemptionStatus !== "all" && (!Object.hasOwn(REDEMPTION_REPORT_STATUSES, redemptionStatus) || report !== "redemptions"))) {
    throw new AnnualReportError("ตัวกรองไม่ตรงกับประเภทรายงาน");
  }
  return { academicYearId, report: report as AnnualReportKind, activityStatus, starType, redemptionStatus };
}

export function annualReportFilterLabel(filters: AnnualReportFilters) {
  return [
    filters.activityStatus === "all" ? "" : ACTIVITY_REPORT_STATUSES[filters.activityStatus as keyof typeof ACTIVITY_REPORT_STATUSES],
    filters.starType === "all" ? "" : STAR_REPORT_TYPES[filters.starType as keyof typeof STAR_REPORT_TYPES],
    filters.redemptionStatus === "all" ? "" : REDEMPTION_REPORT_STATUSES[filters.redemptionStatus as keyof typeof REDEMPTION_REPORT_STATUSES],
  ].filter(Boolean).join(" · ") || "ทุกสถานะ";
}

export type ReportCell = string | number | null;
export type ReportSheet = { id: Exclude<AnnualReportKind, "all">; name: string; columns: string[]; rows: ReportCell[][] };
export type AnnualReportSummary = {
  activities: number; registrations: number; uniqueAttendees: number; attendanceCount: number;
  completedCount: number; qualifiedCount: number; minutes: number;
  yellowStars: number; greenStars: number; earned: number; spent: number; balance: number; reserved: number; available: number;
  redemptions: number; issues: number;
};
