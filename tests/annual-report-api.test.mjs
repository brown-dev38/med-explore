import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { loadTypeScript } from "./load-typescript.mjs";
import { annualFixture } from "./annual-report-fixtures.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const options = loadTypeScript("../lib/annual-report-options.ts");
const reportBuilder = loadTypeScript("../lib/annual-report.ts", {
  "@/lib/annual-report-options": options, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
});
const workbook = loadTypeScript("../lib/annual-report-workbook.ts", {
  "server-only": {}, "@/lib/annual-report-options": options, "@/lib/annual-report": reportBuilder,
});
const principal = (role) => role ? { id: "1", name: "Report operator", roles: [role], permissions: role === "ORGANIZER" ? ["activity.manage", "star.approve", "reward.manage"] : [] } : null;

function routes(user = principal("ADMIN"), failure) {
  const loads = [];
  const audits = [];
  const data = annualFixture();
  data.activities.push(...Array.from({ length: 20 }, (_, index) => ({ ...data.activities[0], id: BigInt(100 + index), title: `Extra ${index}` })));
  const api = loadTypeScript("../app/api/reports/annual/route.ts", {
    "@/lib/dal": { getCurrentUser: async () => user }, "@/lib/permissions": permissions,
    "@/lib/api": loadTypeScript("../lib/api.ts"), "@/lib/annual-report-options": options,
    "@/lib/annual-report-data": { loadAnnualReportData: async (id) => {
      loads.push(id);
      if (failure) throw failure;
      return data;
    } },
    "@/lib/annual-report": reportBuilder, "@/lib/annual-report-workbook": workbook,
    "@/lib/audit": { recordAudit: async (entry) => { audits.push(entry); } },
  });
  return { loads, audits,
    preview: (query = "academicYearId=2") => api.GET(new Request(`https://example.test/api/reports/annual?${query}`)),
    download: (query = "academicYearId=2") => api.POST(new Request(`https://example.test/api/reports/annual?${query}`, { method: "POST" })),
  };
}

test("report previews and downloads reject guests, students and incomplete organizer permissions before reading data", async () => {
  for (const user of [null, principal("STUDENT"), { ...principal("STUDENT"), permissions: ["activity.manage", "star.approve", "reward.manage"] }, { ...principal("ORGANIZER"), permissions: ["activity.manage"] }]) {
    const api = routes(user);
    assert.equal((await api.preview()).status, user ? 403 : 401);
    assert.equal((await api.download()).status, user ? 403 : 401);
    assert.deepEqual(api.loads, []);
    assert.deepEqual(api.audits, []);
  }
});

test("ADMIN and authorized ORGANIZER receive bounded previews without triggering an export audit", async () => {
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const api = routes(principal(role));
    const response = await api.preview();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const { data } = await response.json();
    const activities = data.sheets.find((sheet) => sheet.id === "activities");
    assert.equal(activities.rowCount, 25);
    assert.equal(activities.rows.length, 10);
    assert.ok(data.sheets.every((sheet) => sheet.rows.length <= 10));
    assert.deepEqual(api.loads, ["2"]);
    assert.equal(api.audits.length, 0);
  }
});

test("downloads return a genuine XLSX with all rows and record its year, filters and row counts", async () => {
  const api = routes();
  const response = await api.download("academicYearId=2&report=activities&activityStatus=COMPLETED");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(response.headers.get("Content-Disposition"), /^attachment; filename="medexplore-annual-2569-activities-[a-f0-9]+\.xlsx"$/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const file = new ExcelJS.Workbook();
  await file.xlsx.load(Buffer.from(await response.arrayBuffer()));
  assert.equal(file.worksheets.length, 2);
  assert.equal(file.getWorksheet("สรุปรายกิจกรรม").rowCount, 28, "22 matching activities plus six heading rows");
  assert.equal(api.audits.length, 1);
  assert.equal(api.audits[0].entityId, 2n);
  assert.equal(api.audits[0].details.filters.activityStatus, "COMPLETED");
  assert.equal(api.audits[0].details.sheets[1].rows, 22);
});

test("bad filters never query data and missing or oversized years return useful errors", async () => {
  const api = routes();
  assert.equal((await api.preview("academicYearId=invalid")).status, 400);
  assert.equal((await api.download("academicYearId=2&report=stars&activityStatus=DRAFT")).status, 400);
  assert.equal(api.loads.length, 0);
  for (const [message, status] of [["ไม่พบปีการศึกษา", 404], ["ข้อมูลเกินขนาด", 413]]) {
    const missing = routes(principal("ADMIN"), new options.AnnualReportError(message, status));
    const response = await missing.preview();
    assert.equal(response.status, status);
    assert.equal((await response.json()).message, message);
  }
});

test("all report datasets are read from the selected academic year in one repeatable-read transaction", async () => {
  const fixture = annualFixture();
  const calls = [];
  const mapping = { activity: "activities", participation: "participations", helperAssignment: "helpers", starTransaction: "stars", rewardRedemption: "redemptions" };
  const tx = { academicYear: { findUnique: async (query) => { assert.equal(query.where.id, 2n); return fixture.year; } } };
  for (const [model, dataKey] of Object.entries(mapping)) tx[model] = { findMany: async (query) => { calls.push({ model, query }); return fixture[dataKey]; } };
  const { loadAnnualReportData } = loadTypeScript("../lib/annual-report-data.ts", {
    "server-only": {}, "@/lib/annual-report-options": options,
    "@/lib/prisma": { prisma: { $transaction: async (read, settings) => {
      assert.equal(settings.isolationLevel, "RepeatableRead");
      return read(tx);
    } } },
  });
  const data = await loadAnnualReportData("2");
  assert.equal(data.year.id, 2n);
  for (const { model, query } of calls) {
    assert.equal(query.where.academicYearId ?? query.where.activity.academicYearId, 2n, model);
    assert.equal(query.take, 50001);
  }
  assert.ok(!calls.find(({ model }) => model === "helperAssignment").query.select.student.select.passwordHash);
});
