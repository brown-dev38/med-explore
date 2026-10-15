import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const api = loadTypeScript("../lib/api.ts");
const participations = loadTypeScript("../lib/participations.ts", { "server-only": {} });

function routes(principal) {
  const calls = [];
  const mocks = {
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions, "@/lib/validation": validation, "@/lib/api": api,
    "@/lib/participations": participations, "@/lib/qr": { hashQrToken: () => "hash" },
    "@/lib/prisma": { prisma: {
      activity: { findUnique: async () => ({ id: 4n }) },
      qrSession: { findFirst: async () => ({ activityId: 4n, purpose: "CHECK_OUT" }) },
      participation: { findUnique: async ({ where }) => { assert.equal(where.activityId_userId.userId, BigInt(principal.id)); return { id: 7n }; } },
    } },
    "@/lib/attendance": {
      AttendanceError: class extends Error {},
      recordAttendance: async (params) => { calls.push(params); return {
        record: { id: 9n, method: params.method, eventType: params.eventType, occurredAt: params.occurredAt },
        created: true, evaluation: { attendedMinutes: 90, status: "ATTENDED", eligibilityStatus: "APPROVED", yellowStarPoints: 1, message: "ได้รับดาวสีเหลืองอัตโนมัติ 1 ดาว" },
      }; },
      bulkRecordAttendance: async () => { calls.push("bulk"); return { participants: 1, updated: 1, skippedCheckOut: 0 }; },
      attendanceTransaction: async (fn) => fn({}),
      recalculateActivityAttendance: async () => { calls.push("recalculate"); return { participants: 1 }; },
    },
  };
  const request = (body) => new Request("http://localhost/api/attendance", { method: "POST", body: JSON.stringify(body) });
  const context = () => ({ params: Promise.resolve({ id: "4" }) });
  const manual = loadTypeScript("../app/api/attendance/manual/route.ts", mocks);
  const scan = loadTypeScript("../app/api/attendance/scan/route.ts", mocks);
  const bulk = loadTypeScript("../app/api/activities/[id]/attendance/bulk/route.ts", mocks);
  const recalculate = loadTypeScript("../app/api/activities/[id]/attendance/recalculate/route.ts", mocks);
  return { calls,
    manual: (body = { participationId: "7", eventType: "CHECK_OUT" }) => manual.POST(request(body)),
    scan: () => scan.POST(request({ token: "qr-token", userId: "999", yellowStarPoints: 999 })),
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

test("manual attendance returns server-calculated minutes and stars regardless of client point claims", async () => {
  const handlers = routes({ id: "1", roles: ["ORGANIZER"], permissions: ["attendance.record"] });
  const response = await handlers.manual({ participationId: "7", eventType: "CHECK_OUT", yellowStarPoints: 999 });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.evaluation.attendedMinutes, 90);
  assert.equal(data.evaluation.yellowStarPoints, 1);
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
  assert.equal(data.evaluation.yellowStarPoints, 1);
  assert.equal(handlers.calls[0].recordedBy, 5n);
  assert.equal(handlers.calls[0].method, "QR");
  assert.equal(handlers.calls[0].participationId, 7n);
});

test("activity managers can recalculate stored attendance", async () => {
  const handlers = routes({ id: "1", roles: ["ADMIN"], permissions: ["activity.manage"] });
  assert.equal((await handlers.recalculate()).status, 200);
  assert.deepEqual(handlers.calls, ["recalculate"]);
});
