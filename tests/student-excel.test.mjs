import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { loadTypeScript } from "./load-typescript.mjs";

const schema = loadTypeScript("../lib/green-star-import-schema.ts");
const { readStudentExcel, StudentExcelError } = loadTypeScript("../lib/student-excel.ts", {
  "server-only": {}, "@/lib/green-star-import-schema": schema,
});

async function excel(setup) {
  const workbook = new ExcelJS.Workbook();
  setup(workbook.addWorksheet("Students"), workbook);
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("Excel import reads only column A of the first sheet, skips headers/blanks and preserves leading zeros", async () => {
  const buffer = await excel((sheet, workbook) => {
    sheet.addRows([["รหัสนักศึกษา", "ชื่อ"], [" 001234 ", "Ignored"], [], [1235], [69001234], ["001234"], [null, "999999"]]);
    sheet.getCell("A4").numFmt = "000000";
    workbook.addWorksheet("Other").addRow(["999999"]);
  });
  const rows = await readStudentExcel(buffer);
  assert.deepEqual(rows.map(({ row, studentCode, status }) => ({ row, studentCode, status })), [
    { row: 2, studentCode: "001234", status: "ready" },
    { row: 4, studentCode: "001235", status: "ready" },
    { row: 5, studentCode: "69001234", status: "ready" },
    { row: 6, studentCode: "001234", status: "duplicate" },
  ]);
});

test("files without a header retain their first student; common Thai and English headers are optional", async () => {
  for (const header of [null, "รหัสนิสิต", "Student ID", "student_code", "Student Number"]) {
    const rows = await readStudentExcel(await excel((sheet) => {
      sheet.addRow([]);
      if (header) sheet.addRow([header]);
      sheet.addRow(["001234"]);
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].studentCode, "001234");
    assert.equal(rows[0].status, "ready");
  }
});

test("formula, date, boolean, fractional and unsafe numeric codes are reported instead of guessed", async () => {
  const rows = await readStudentExcel(await excel((sheet) => {
    for (const value of [{ formula: "1+1", result: 2 }, new Date("2026-01-01"), true, 1.5, Number.MAX_SAFE_INTEGER + 1, "x".repeat(51)]) sheet.addRow([value]);
    sheet.addRow([{ richText: [{ text: "001" }, { text: "234" }] }]);
    sheet.addRow([{ text: "001235", hyperlink: "https://example.test" }]);
  }));
  assert.ok(rows.slice(0, 6).every((row) => row.status === "invalid"));
  assert.deepEqual(rows.slice(6).map((row) => row.studentCode), ["001234", "001235"]);
});

test("invalid, empty and oversized workbooks and more than 500 data rows are rejected", async () => {
  for (const bytes of [new ArrayBuffer(0), new ArrayBuffer(schema.MAX_STUDENT_IMPORT_BYTES + 1), new TextEncoder().encode("not excel").buffer]) {
    await assert.rejects(readStudentExcel(bytes), StudentExcelError);
  }
  await assert.rejects(readStudentExcel(await excel((sheet) => sheet.addRow(["รหัสนักศึกษา"]))), /ไม่พบรหัส/);
  await assert.rejects(readStudentExcel(await excel((sheet) => {
    for (let i = 0; i <= 500; i++) sheet.addRow([String(i)]);
  })), /500/);
});

test("confirmation requires bounded unique student codes, valid targets, a request ID and a work description", () => {
  const input = { target: { mode: "work", academicYearId: "2" }, studentCodes: ["001234"], description: "Help prepare room", requestId: "7a095e62-eaf5-4b0b-8dd1-938f019787d0" };
  assert.equal(schema.greenStarImportSchema.safeParse(input).success, true);
  for (const change of [{ studentCodes: [] }, { studentCodes: ["001234", "001234"] }, { studentCodes: [""] }, { studentCodes: Array.from({ length: 501 }, (_, i) => String(i)) }, { requestId: "invalid" }, { description: " " }, { target: { mode: "work", academicYearId: "9223372036854775808" } }, { target: { mode: "activity", academicYearId: "2" } }]) {
    assert.equal(schema.greenStarImportSchema.safeParse({ ...input, ...change }).success, false);
  }
  const parsed = schema.greenStarImportSchema.parse({ ...input, points: 999, target: { mode: "activity", academicYearId: "2", activityId: "4" }, description: "" });
  assert.equal("points" in parsed, false);
});
