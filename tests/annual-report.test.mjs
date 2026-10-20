import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { loadTypeScript } from "./load-typescript.mjs";
import { annualFixture } from "./annual-report-fixtures.mjs";

const options = loadTypeScript("../lib/annual-report-options.ts");
const reports = loadTypeScript("../lib/annual-report.ts", {
  "@/lib/annual-report-options": options,
  "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
});
const workbookWriter = loadTypeScript("../lib/annual-report-workbook.ts", {
  "server-only": {}, "@/lib/annual-report": reports, "@/lib/annual-report-options": options,
});
const filters = (extra = "") => options.parseAnnualReportFilters(new URLSearchParams(`academicYearId=2${extra}`));
const build = (data = annualFixture(), query = filters()) => reports.buildAnnualReport(data, query, "Report operator", "report-test-123");

test("annual totals distinguish people, visits, actual minutes, earned stars, spending, reservations and adjustments", () => {
  const data = annualFixture();
  const original = structuredClone(data);
  const report = build(data);
  assert.equal(report.sheets.length, 7);
  assert.deepEqual(report.summary, {
    activities: 5, registrations: 5, uniqueAttendees: 2, attendanceCount: 4, completedCount: 2, qualifiedCount: 1, minutes: 180,
    yellowStars: 1, greenStars: 5, earned: 8, spent: 3, balance: 4, reserved: 2, available: 2, redemptions: 3, issues: 5,
  });
  const people = report.sheets.find((s) => s.id === "students").rows;
  assert.equal(people.length, 3, "assigned helpers with no other records are still represented");
  const student = people.find((row) => row[0] === "9007199254740993");
  assert.equal(student[1], "00001234");
  assert.equal(student[7], 120, "cancelled activities do not add attendance minutes");
  const issues = report.sheets.find((s) => s.id === "issues").rows.map((row) => row[0]);
  assert.ok(issues.includes("ฉบับร่างเลยกำหนด"));
  assert.ok(issues.includes("ขาดเช็คเอาท์"));
  assert.deepEqual(data, original, "exporting does not recalculate or modify stored records");
});

test("closed-year reports retain ledger history while spendable stars become zero", () => {
  const report = build(annualFixture("CLOSED"));
  assert.equal(report.summary.earned, 8);
  assert.equal(report.summary.spent, 3);
  assert.equal(report.summary.balance, 4);
  assert.equal(report.summary.reserved, 2);
  assert.equal(report.summary.available, 0);
});

test("detail filters select matching rows while the accompanying overview stays explicitly annual", () => {
  const annual = build();
  const attendance = build(annualFixture(), filters("&report=attendance&activityStatus=COMPLETED"));
  assert.deepEqual(attendance.sheets.map((s) => s.id), ["overview", "attendance"]);
  assert.equal(attendance.sheets[1].rows.length, 3);
  assert.deepEqual(attendance.summary, annual.summary);
  assert.equal(attendance.sheets[0].rows.find((row) => row[0] === "ขอบเขตภาพรวม")[1], "ทั้งปีการศึกษาที่เลือก ทุกสถานะ");
  assert.equal(build(annualFixture(), filters("&report=stars&starType=GREEN")).sheets[1].rows.length, 2);
  assert.equal(build(annualFixture(), filters("&report=redemptions&redemptionStatus=PENDING")).sheets[1].rows.length, 1);
});

test("invalid years, duplicate parameters, unknown and incompatible filters are rejected", () => {
  for (const query of ["", "academicYearId=0", "academicYearId=-1", "academicYearId=abc", "academicYearId=9223372036854775808",
    "academicYearId=2&academicYearId=3", "academicYearId=2&report=unknown", "academicYearId=2&activityStatus=DRAFT",
    "academicYearId=2&report=stars&starType=constructor", "academicYearId=2&report=attendance&activityStatus=__proto__",
    "academicYearId=2&report=all&redemptionStatus=PENDING", "academicYearId=2&format=csv"]) {
    assert.throws(() => options.parseAnnualReportFilters(new URLSearchParams(query)), options.AnnualReportError, query);
  }
});

test("future, reversed, missing, and stale stored attendance totals are surfaced without inventing attendance", () => {
  const data = annualFixture();
  const p = data.participations[0];
  p.attendedMinutes = 999;
  p.eligibilityStatus = "PENDING";
  let report = build(data);
  assert.equal(report.summary.minutes, 180);
  assert.ok(report.sheets.at(-1).rows.some((row) => row[0] === "เวลาสรุปไม่ตรงกับบันทึก"));
  p.attendanceRecords = [{ eventType: "CHECK_OUT", occurredAt: new Date("2099-01-01Z"), method: "QR" }];
  report = build(data);
  assert.equal(report.summary.minutes, 60);
  assert.ok(report.sheets.at(-1).rows.some((row) => row[0] === "เวลาเข้า–ออกไม่ครบ"));
  assert.ok(report.sheets.at(-1).rows.some((row) => row[0] === "เวลาในอนาคต"));
  p.attendanceRecords.push({ eventType: "CHECK_IN", occurredAt: new Date("2100-01-01Z"), method: "QR" });
  assert.ok(build(data).sheets.at(-1).rows.some((row) => row[0] === "ลำดับเวลาไม่ถูกต้อง"));
});

test("the XLSX reopens with seven Thai sheets, metadata, filters, numeric totals, exact IDs and safe text cells", async () => {
  const report = build();
  const bytes = await workbookWriter.createAnnualReportWorkbook(report);
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  assert.deepEqual(workbook.worksheets.map((s) => s.name), report.sheets.map((s) => s.name));
  for (const sheet of workbook.worksheets) {
    assert.match(sheet.getCell("A2").text, /20\/10\/2026.*13:00:00/);
    assert.match(sheet.getCell("A3").text, /report-test-123/);
    assert.equal(sheet.views[0].ySplit, 6);
    assert.ok(sheet.autoFilter);
  }
  const students = workbook.getWorksheet("สรุปรายบุคคล");
  let student;
  students.eachRow((row) => { if (row.getCell(1).value === "9007199254740993") student = row; });
  assert.equal(student.getCell(2).value, "00001234");
  assert.equal(typeof student.getCell(3).value, "string");
  assert.match(student.getCell(3).value, /^=HYPERLINK/);
  assert.equal(student.getCell(3).type, ExcelJS.ValueType.String);
  assert.equal(student.getCell(14).value, 4);
  assert.match(workbook.getWorksheet("สรุปรายกิจกรรม").getCell("F7").text, /01\/01\/2026.*01:00:00/);
});

test("an empty academic year still produces a valid workbook with headers and zero totals", async () => {
  const data = annualFixture();
  for (const name of ["activities", "participations", "helpers", "stars", "redemptions"]) data[name] = [];
  const report = build(data);
  assert.ok(Object.values(report.summary).every((value) => value === 0));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await workbookWriter.createAnnualReportWorkbook(report)));
  assert.equal(workbook.worksheets.length, 7);
  assert.equal(workbook.getWorksheet("รายละเอียดการเข้าร่วม").getRow(6).getCell(1).value, "รหัสลงทะเบียน");
});
