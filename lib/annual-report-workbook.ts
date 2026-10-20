import "server-only";
import ExcelJS from "exceljs";
import type { AnnualReport } from "@/lib/annual-report";
import { annualReportFilterLabel } from "@/lib/annual-report-options";
import { reportDate } from "@/lib/annual-report";

export async function createAnnualReportWorkbook(report: AnnualReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.exporter;
  workbook.created = new Date(report.generatedAt);
  workbook.title = `MedExplore Star ปีการศึกษา ${report.year.code}`;
  workbook.subject = `ข้อมูล ณ ${report.generatedAt} · ${report.exportId}`;
  for (const table of report.sheets) {
    const sheet = workbook.addWorksheet(table.name, {
      views: [{ state: "frozen", ySplit: 6 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = table.columns.map((column, index) => ({
      width: Math.min(48, Math.max(16, column.length + 3, ...table.rows.slice(0, 100).map((row) => String(row[index] ?? "").length + 2))),
    }));
    sheet.addRow([`${table.name} · ปีการศึกษา ${report.year.code}`]);
    sheet.addRow([`ข้อมูล ณ ${reportDate(new Date(report.generatedAt))} (Asia/Bangkok) · ${report.year.status === "CLOSED" ? "ปีปิดแล้ว" : "ข้อมูลระหว่างปี"}`]);
    sheet.addRow([`ผู้ส่งออก: ${report.exporter} · รหัสรายงาน: ${report.exportId}`]);
    sheet.addRow([`รายละเอียด: ${annualReportFilterLabel(report.filters)} · ภาพรวมครอบคลุมทั้งปี ทุกสถานะ`]);
    sheet.addRow([]);
    const header = sheet.addRow(table.columns);
    header.height = 32;
    header.eachCell((cell) => {
      cell.font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17665D" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    for (let row = 1; row <= 4; row++) sheet.mergeCells(row, 1, row, table.columns.length);
    sheet.getRow(1).font = { name: "Tahoma", size: 16, bold: true, color: { argb: "FF17665D" } };
    sheet.getRow(1).height = 30;
    for (let row = 2; row <= 4; row++) {
      sheet.getRow(row).font = { name: "Tahoma", size: 10 };
      sheet.getRow(row).alignment = { wrapText: true, vertical: "middle" };
      sheet.getRow(row).height = 30;
    }
    for (const values of table.rows) {
      // Plain strings stay text, preserving leading zeroes and never becoming formulas.
      const row = sheet.addRow(values);
      row.font = { name: "Tahoma", size: 11 };
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0;[Red]-#,##0";
        if (row.number % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7F5" } };
      });
    }
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, sheet.rowCount), column: table.columns.length } };
    sheet.pageSetup.printTitlesRow = "1:6";
    sheet.headerFooter.oddFooter = `ปีการศึกษา ${report.year.code} · &P / &N`;
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
