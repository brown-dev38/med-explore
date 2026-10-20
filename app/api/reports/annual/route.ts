import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/dal";
import { canExportAnnualReports } from "@/lib/permissions";
import { errorResponse, successResponse } from "@/lib/api";
import { AnnualReportError, parseAnnualReportFilters } from "@/lib/annual-report-options";
import { loadAnnualReportData } from "@/lib/annual-report-data";
import { buildAnnualReport } from "@/lib/annual-report";
import { recordAudit } from "@/lib/audit";

async function respond(request: Request, download: boolean) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
  if (!canExportAnnualReports(user)) return errorResponse("ไม่มีสิทธิ์ส่งออกรายงานประจำปี", 403);
  try {
    const filters = parseAnnualReportFilters(new URL(request.url).searchParams);
    const data = await loadAnnualReportData(filters.academicYearId);
    const report = buildAnnualReport(data, filters, user.name ?? user.email ?? `ผู้ใช้งาน ${user.id}`, randomUUID());
    if (!download) {
      const response = successResponse({ ...report, sheets: report.sheets.map((sheet) => ({ ...sheet, rowCount: sheet.rows.length, rows: sheet.rows.slice(0, 10) })) });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const { createAnnualReportWorkbook } = await import("@/lib/annual-report-workbook");
    const bytes = await createAnnualReportWorkbook(report);
    const yearName = data.year.code.replace(/[^a-zA-Z0-9_-]/g, "_") || String(data.year.id);
    const filename = `medexplore-annual-${yearName}-${filters.report}-${report.exportId.slice(0, 8)}.xlsx`;
    await recordAudit({ actorId: BigInt(user.id), action: "report.annual.export", entityType: "AcademicYear", entityId: data.year.id,
      details: { exportId: report.exportId, generatedAt: report.generatedAt, filters, sheets: report.sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length })), summary: report.summary } });
    return new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AnnualReportError) return errorResponse(error.message, error.status);
    console.error("Annual report failed:", error);
    return errorResponse("สร้างรายงานไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}

export function GET(request: Request) { return respond(request, false); }
export function POST(request: Request) { return respond(request, true); }
