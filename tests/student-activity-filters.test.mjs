import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Load the actual TypeScript helpers without adding a test framework or loader.
const source = fs.readFileSync(new URL("../lib/student-activity-filters.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
const { selectStudentYear, studentActivityWhere, studentActivitiesHref, isIncompleteCompletedParticipation } = helpers;

const now = new Date("2026-10-15T00:03:00+07:00");
const past = new Date("2026-10-15T00:02:00+07:00");
const future = new Date("2026-10-15T01:00:00+07:00");
const years = [
  { id: "3", code: "2570", status: "DRAFT" },
  { id: "2", code: "2569", status: "ACTIVE" },
  { id: "1", code: "2568", status: "CLOSED" },
];

test("year selection supports history, defaults to active, then newest, and handles no years", () => {
  assert.equal(selectStudentYear(years).id, "2");
  assert.equal(selectStudentYear(years, "1").code, "2568");
  assert.equal(selectStudentYear(years.filter((year) => year.status !== "ACTIVE")).id, "3");
  assert.equal(selectStudentYear([]), null);
  assert.equal(selectStudentYear(years, "999"), null);
  assert.equal(selectStudentYear(years, "invalid"), null);
});

test("drill-down links preserve the selected year and requested filter", () => {
  for (const filter of ["all", "missed", "attended", "cancelled"]) {
    const url = new URL(studentActivitiesHref("1", filter), "https://example.test");
    assert.equal(url.pathname, "/dashboard/year-activities");
    assert.equal(url.searchParams.get("academicYearId"), "1");
    assert.equal(url.searchParams.get("filter") ?? "all", filter);
  }
});

test("staff drill-down links retain the selected student, workspace, historical year and filter", () => {
  for (const area of ["admin", "organizer"]) {
    const url = new URL(studentActivitiesHref("1", "missed", `/${area}/students/42/dashboard`), "https://example.test");
    assert.equal(url.pathname, `/${area}/students/42/dashboard/year-activities`);
    assert.equal(url.searchParams.get("academicYearId"), "1");
    assert.equal(url.searchParams.get("filter"), "missed");
  }
});

// Evaluate the Prisma operators used by these filters against business fixtures.
function matches(record, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return expected.every((item) => matches(record, item));
    if (key === "OR") return expected.some((item) => matches(record, item));
    const actual = record[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("some" in expected) return actual.some((item) => matches(item, expected.some));
      if ("none" in expected) return !actual.some((item) => matches(item, expected.none));
      if ("lte" in expected) return actual <= expected.lte;
    }
    return actual === expected;
  });
}

function participation(userId, ...events) {
  return { userId: BigInt(userId), attendanceRecords: events.map((eventType) => ({ eventType })) };
}
function activity(id, status, endsAt = past, participations = [], academicYearId = 2n) {
  return { id, status, endsAt, participations, academicYearId };
}

const activities = [
  activity("never registered", "COMPLETED"),
  activity("registered but absent", "COMPLETED", past, [participation(10)]),
  activity("elapsed published", "PUBLISHED"),
  activity("exact end boundary", "PUBLISHED", now),
  activity("ended early by admin", "COMPLETED", future),
  activity("someone else checked in", "COMPLETED", past, [participation(20, "CHECK_IN")]),
  activity("attended", "COMPLETED", past, [participation(10, "CHECK_IN", "CHECK_OUT")]),
  activity("only checked in", "COMPLETED", past, [participation(10, "CHECK_IN")]),
  activity("still open", "PUBLISHED", future),
  activity("cancelled", "CANCELLED"),
  activity("draft", "DRAFT"),
  activity("another year", "COMPLETED", past, [], 1n),
  activity("another student's full attendance", "COMPLETED", past, [participation(20, "CHECK_IN", "CHECK_OUT")]),
  activity("check-in belongs to user, check-out to someone else", "COMPLETED", past, [participation(10, "CHECK_IN"), participation(20, "CHECK_OUT")]),
];

test("missed includes ended activities without the student's check-in, even if not registered", () => {
  const query = studentActivityWhere("2", "10", now, "missed");
  assert.deepEqual(activities.filter((item) => matches(item, query)).map((item) => item.id), [
    "never registered", "registered but absent", "elapsed published", "exact end boundary",
    "ended early by admin", "someone else checked in", "another student's full attendance",
  ]);
});

test("all activities includes all statuses but only the selected year", () => {
  const query = studentActivityWhere("2", "10", now);
  const results = activities.filter((item) => matches(item, query));
  assert.equal(results.length, 13);
  assert.ok(results.some((item) => item.id === "cancelled"));
  assert.ok(results.some((item) => item.id === "draft"));
  assert.ok(!results.some((item) => item.id === "another year"));
});

test("completed attendance requires both records belonging to the same student", () => {
  const query = studentActivityWhere("2", "10", now, "attended");
  assert.deepEqual(activities.filter((item) => matches(item, query)).map((item) => item.id), ["attended"]);
});

test("historical year queries exclude the current year's activities", () => {
  const query = studentActivityWhere("1", "10", now, "missed");
  assert.deepEqual(activities.filter((item) => matches(item, query)).map((item) => item.id), ["another year"]);
});

test("cancelled activities belong to the selected year regardless of registration", () => {
  const records = activities.concat([
    activity("registered cancelled", "CANCELLED", future, [participation(10)]),
    activity("cancelled another year", "CANCELLED", past, [], 1n),
  ]);
  const query = studentActivityWhere("2", "10", now, "cancelled");
  assert.deepEqual(records.filter((item) => matches(item, query)).map((item) => item.id), ["cancelled", "registered cancelled"]);
});

test("a completed activity with only check-in needs time verification, not full attendance or missed", () => {
  const record = activities.find((item) => item.id === "only checked in");
  const attendance = record.participations[0];
  const data = { activity: record, attendanceRecords: attendance.attendanceRecords };
  const original = structuredClone(data);
  assert.equal(isIncompleteCompletedParticipation(data), true);
  assert.equal(matches(record, studentActivityWhere("2", "10", now, "attended")), false);
  assert.equal(matches(record, studentActivityWhere("2", "10", now, "missed")), false);
  assert.deepEqual(data, original, "displaying incomplete attendance must not fabricate a checkout");
});

test("a recorded checkout resolves the incomplete notice; other activity statuses do not trigger it", () => {
  const data = { activity: { status: "COMPLETED" }, attendanceRecords: [{ eventType: "CHECK_IN" }] };
  assert.equal(isIncompleteCompletedParticipation({ ...data, attendanceRecords: [...data.attendanceRecords, { eventType: "CHECK_OUT" }] }), false);
  assert.equal(isIncompleteCompletedParticipation({ ...data, attendanceRecords: [] }), false);
  for (const status of ["DRAFT", "PUBLISHED", "CANCELLED"]) {
    assert.equal(isIncompleteCompletedParticipation({ ...data, activity: { status } }), false, status);
  }
});
