import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const api = loadTypeScript("../lib/api.ts");
const participations = loadTypeScript("../lib/participations.ts", { "server-only": {} });

function routes(principal, { validQr = true, yearStatus = "ACTIVE", yearId = 1n, registered = true } = {}) {
  const calls = [];
  const qrReads = [];
  const mocks = {
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions, "@/lib/validation": validation, "@/lib/api": api,
    "@/lib/participations": participations, "@/lib/qr": { hashQrToken: () => "hash" },
    "@/lib/prisma": { prisma: {
      activity: { findUnique: async () => ({ id: 4n }) },
      qrSession: { findFirst: async (query) => { qrReads.push(query); return validQr ? {
        activityId: 4n, id: 9n, purpose: "CHECK_IN", expiresAt: new Date(Date.now() + 60000),
        activity: { id: 4n, title: "QR activity", status: "PUBLISHED", academicYearId: yearId, academicYear: { status: yearStatus } },
      } : null; } },
      participation: { findUnique: async ({ where }) => { assert.equal(where.activityId_userId.userId, BigInt(principal.id)); return registered ? { id: 7n } : null; } },
    } },
    "@/lib/attendance": {
      AttendanceError: class extends Error {},
      recordAttendance: async (params) => { calls.push(params); return {
        record: { id: 9n, method: params.method, eventType: params.eventType, occurredAt: params.occurredAt },
        created: true, evaluation: { attendedMinutes: null, status: "ATTENDED", eligibilityStatus: "PENDING", yellowStarPoints: 0, message: "เช็คอินแล้ว รอ QR Code หมดอายุเพื่อรับดาวสีเหลืองอัตโนมัติ" },
      }; },
      bulkRecordAttendance: async () => { calls.push("bulk"); return { participants: 1, updated: 1, skippedCheckOut: 0 }; },
      attendanceTransaction: async (fn) => fn({}),
      recalculateActivityAttendance: async () => { calls.push("recalculate"); return { participants: 1 }; },
    },
    "@/lib/attendance-worker": { scheduleAttendanceReview: () => {} },
  };
  const request = (body) => new Request("http://localhost/api/attendance", { method: "POST", body: JSON.stringify(body) });
  const context = () => ({ params: Promise.resolve({ id: "4" }) });
  const manual = loadTypeScript("../app/api/attendance/manual/route.ts", mocks);
  const scan = loadTypeScript("../app/api/attendance/scan/route.ts", mocks);
  const bulk = loadTypeScript("../app/api/activities/[id]/attendance/bulk/route.ts", mocks);
  const recalculate = loadTypeScript("../app/api/activities/[id]/attendance/recalculate/route.ts", mocks);
  return { calls, qrReads,
    preview: (token = "qr-token", yearId) => scan.GET(new Request(`http://localhost/api/attendance/scan?token=${encodeURIComponent(token)}${yearId === undefined ? "" : `&academicYearId=${encodeURIComponent(yearId)}`}`)),
    manual: (body = { participationId: "7", eventType: "CHECK_IN" }) => manual.POST(request(body)),
    scan: (extra = {}) => scan.POST(request({ token: "qr-token", userId: "999", yellowStarPoints: 999, ...extra })),
    bulk: () => bulk.POST(request({ checkInAt: "2026-10-14T09:00:00Z", checkOutAt: "2026-10-14T10:30:00Z" }), context()),
    recalculate: () => recalculate.POST(request({}), context()),
  };
}

test("students and guests cannot record attendance for others or request recalculation", async () => {
  for (const principal of [null, { id: "5", roles: ["STUDENT"], permissions: [] }]) {
    const handlers = routes(principal);
    for (const method of ["manual", "bulk", "recalculate"]) assert.equal((await handlers[method]()).status, principal ? 403 : 401);
    assert.deepEqual(handlers.calls, []);
  }
});

test("manual check-in returns a pending award regardless of client point claims", async () => {
  const handlers = routes({ id: "1", roles: ["ORGANIZER"], permissions: ["attendance.record"] });
  const response = await handlers.manual({ participationId: "7", eventType: "CHECK_IN", yellowStarPoints: 999 });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.evaluation.attendedMinutes, null);
  assert.equal(data.evaluation.yellowStarPoints, 0);
  assert.equal(handlers.calls[0].recordedBy, 1n);
  assert.equal(handlers.calls[0].replaceExisting, true);
  assert.equal(handlers.calls[0].yellowStarPoints, undefined);
  assert.equal((await handlers.recalculate()).status, 403);
  assert.equal((await handlers.bulk()).status, 200);
});

test("QR attendance always records for the signed-in student and returns the calculated award", async () => {
  const handlers = routes({ id: "5", roles: ["STUDENT"], permissions: [] });
  const response = await handlers.scan();
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.activityId, "4");
  assert.equal(data.evaluation.yellowStarPoints, 0);
  assert.equal(handlers.calls[0].recordedBy, 5n);
  assert.equal(handlers.calls[0].method, "QR");
  assert.equal(handlers.calls[0].participationId, 7n);
  assert.equal(handlers.calls[0].qrSessionId, 9n);
  assert.equal(handlers.qrReads[0].where.purpose, "CHECK_IN");
});

test("checkout is rejected by the manual attendance endpoint", async () => {
  const handlers = routes({ id: "1", roles: ["ADMIN"], permissions: ["attendance.record"] });
  assert.equal((await handlers.manual({ participationId: "7", eventType: "CHECK_OUT" })).status, 400);
  assert.deepEqual(handlers.calls, []);
});

test("activity managers can recalculate stored attendance", async () => {
  const handlers = routes({ id: "1", roles: ["ADMIN"], permissions: ["activity.manage"] });
  assert.equal((await handlers.recalculate()).status, 200);
  assert.deepEqual(handlers.calls, ["recalculate"]);
});

test("QR preview is read-only and attendance is written only by the later POST", async () => {
  const handlers = routes({ id: "5", roles: ["STUDENT"], permissions: [] });
  const response = await handlers.preview();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.purpose, "CHECK_IN");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(handlers.calls, []);
  assert.equal(handlers.qrReads[0].where.revokedAt, null);
  assert.ok(handlers.qrReads[0].where.expiresAt.gt instanceof Date);
  assert.equal((await handlers.scan()).status, 201);
  assert.equal(handlers.calls.length, 1);
});

test("QR preview rejects guests, missing tokens, expired and revoked sessions without writing attendance", async () => {
  const guest = routes(null);
  assert.equal((await guest.preview()).status, 401);
  assert.deepEqual(guest.qrReads, []);
  const missing = routes({ id: "5" });
  assert.equal((await missing.preview("")).status, 400);
  assert.deepEqual(missing.qrReads, []);
  const invalid = routes({ id: "5" }, { validQr: false });
  assert.equal((await invalid.preview()).status, 400);
  assert.equal((await invalid.scan()).status, 400);
  assert.deepEqual(invalid.calls, []);
});

test("QR preview and submission reject closed and draft years even without a selected-year parameter", async () => {
  for (const yearStatus of ["CLOSED", "DRAFT"]) {
    for (const registered of [true, false]) {
      const handlers = routes({ id: "5" }, { yearStatus, registered });
      assert.equal((await handlers.preview()).status, 409);
      const response = await handlers.scan();
      assert.equal(response.status, 409);
      assert.notEqual((await response.json()).code, "NOT_REGISTERED");
      assert.deepEqual(handlers.calls, []);
    }
  }
});

test("a QR from another year cannot record attendance in the selected year", async () => {
  const handlers = routes({ id: "5" }, { yearId: 2n });
  for (const response of [await handlers.preview("qr-token", "1"), await handlers.scan({ academicYearId: "1" })]) {
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /คนละปีการศึกษา/);
  }
  assert.deepEqual(handlers.calls, []);
  assert.equal((await handlers.preview("qr-token", "2")).status, 200);
  assert.equal((await handlers.scan({ academicYearId: "2" })).status, 201);
});

test("invalid selected-year IDs are rejected before looking up QR sessions", async () => {
  for (const academicYearId of ["0", "-1", "abc", "1.5", "01", "9223372036854775808"]) {
    const handlers = routes({ id: "5" });
    assert.equal((await handlers.preview("qr-token", academicYearId)).status, 400);
    assert.equal((await handlers.scan({ academicYearId })).status, 400);
    assert.deepEqual(handlers.qrReads, []);
  }
});
