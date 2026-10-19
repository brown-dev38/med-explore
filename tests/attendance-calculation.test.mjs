import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const calculation = loadTypeScript("../lib/attendance-calculation.ts");
const start = new Date("2026-10-14T16:30:00Z");

test("attendance minutes use the full real interval and floor partial minutes", () => {
  for (const [seconds, minutes] of [[0, 0], [59, 0], [5399, 89], [5400, 90], [5401, 90], [14400, 240]]) {
    assert.equal(calculation.calculateAttendedMinutes(start, new Date(start.getTime() + seconds * 1000)), minutes);
  }
});

test("attendance crosses midnight correctly and requires both records", () => {
  assert.equal(calculation.calculateAttendedMinutes(start, new Date("2026-10-14T18:00:00Z")), 90);
  assert.equal(calculation.calculateAttendedMinutes(start, null), null);
  assert.equal(calculation.calculateAttendedMinutes(null, start), null);
  assert.throws(() => calculation.calculateAttendedMinutes(start, new Date(start.getTime() - 1)), RangeError);
});

test("legacy records display real minutes even when the persisted minute total is missing", () => {
  const legacy = {
    attendedMinutes: null,
    attendanceRecords: [
      { eventType: "CHECK_IN", occurredAt: "2026-10-14T23:51:00+07:00" },
      { eventType: "CHECK_OUT", occurredAt: "2026-10-15T00:03:59+07:00" },
    ],
  };
  assert.equal(calculation.attendanceMinutesFromRecords(legacy.attendanceRecords), 12);
  assert.equal(legacy.attendedMinutes, null);
  assert.equal(calculation.attendanceMinutesFromRecords(legacy.attendanceRecords.slice(0, 1)), null);
  assert.equal(calculation.attendanceMinutesFromRecords([
    { eventType: "CHECK_IN", occurredAt: "2026-10-15T01:00:00+07:00" },
    { eventType: "CHECK_OUT", occurredAt: "2026-10-15T00:00:00+07:00" },
  ]), null);
});

test("the overview sums valid completed attendance and excludes cancelled activities", () => {
  const records = (seconds) => [
    { eventType: "CHECK_IN", occurredAt: start },
    { eventType: "CHECK_OUT", occurredAt: new Date(start.getTime() + seconds * 1000) },
  ];
  assert.equal(calculation.totalAttendanceMinutes([
    { activity: { status: "COMPLETED" }, attendanceRecords: records(5400) },
    { activity: { status: "PUBLISHED" }, attendanceRecords: records(119) },
    { activity: { status: "PUBLISHED" }, attendanceRecords: records(30) },
    { activity: { status: "CANCELLED" }, attendanceRecords: records(3600) },
    { activity: { status: "COMPLETED" }, attendanceRecords: records(-60) },
    { activity: { status: "COMPLETED" }, attendanceRecords: records(3600).slice(0, 1) },
  ]), 91);
  assert.equal(calculation.totalAttendanceMinutes([]), 0);
});

test("attendance and star failures run inside the same transaction and roll all writes back", async () => {
  const state = { records: [], audits: [] };
  const tx = {
    $queryRaw: async () => [{ status: "ACTIVE" }],
    attendanceRecord: { findMany: async () => [], create: async ({ data }) => { const record = { id: 1n, ...data }; state.records.push(record); return record; } },
    participation: { findUniqueOrThrow: async () => ({ activityId: 1n }) },
    auditLog: { create: async ({ data }) => { state.audits.push(data); } },
  };
  const attendance = loadTypeScript("../lib/attendance.ts", {
    "server-only": {},
    "@/lib/attendance-results": { lockAttendanceUser: async () => true, evaluateAttendance: async () => { throw new Error("Star write failed"); } },
    "@/lib/prisma": { prisma: { $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      try { return await fn(tx); } catch (error) { state.records.length = 0; state.audits.length = 0; throw error; }
    } } },
  });
  await assert.rejects(attendance.recordAttendance({ participationId: 1n, eventType: "CHECK_IN", method: "QR", occurredAt: start, recordedBy: 2n }), /Star write failed/);
  assert.equal(state.records.length, 0);
  assert.equal(state.audits.length, 0);
});

test("serializable conflicts retry at most three times", async () => {
  let calls = 0;
  const attendance = loadTypeScript("../lib/attendance.ts", {
    "server-only": {}, "@/lib/attendance-results": {},
    "@/lib/prisma": { prisma: { $transaction: async () => { calls++; throw { code: "P2034" }; } } },
  });
  await assert.rejects(attendance.attendanceTransaction(async () => {}), (error) => error.code === "P2034");
  assert.equal(calls, 3);
});
