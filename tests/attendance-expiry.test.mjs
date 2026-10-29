import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const checkInAt = new Date("2026-10-29T03:00:00Z");
const expiresAt = new Date("2026-10-29T03:15:00Z");
function setup({ used = 0, activityStatus = "PUBLISHED", student = true, due = expiresAt, records } = {}) {
  const state = { star: null, audits: [], participation: {
    id: 1n, userId: 2n, activityId: 3n, reviewDueAt: due, eligibilityStatus: "PENDING",
    activity: { id: 3n, status: activityStatus, academicYearId: 4n, minMinutes: 1440, endsAt: expiresAt },
    attendanceRecords: records ?? [{ eventType: "CHECK_IN", occurredAt: checkInAt }],
    user: { userRoles: student ? [{ role: { name: "STUDENT" } }] : [] },
  } };
  const tx = {
    participation: {
      findUniqueOrThrow: async () => state.participation,
      update: async ({ data }) => Object.assign(state.participation, data),
    },
    qrSession: { findFirst: async () => ({ expiresAt }) },
    starTransaction: {
      findUnique: async () => state.star,
      aggregate: async () => ({ _sum: { points: used } }),
      upsert: async ({ create, update }) => { state.star = state.star ? { ...state.star, ...update } : { id: 5n, ...create }; return state.star; },
    },
    auditLog: { create: async ({ data }) => state.audits.push(data) },
  };
  const { evaluateAttendance } = loadTypeScript("../lib/attendance-results.ts", {
    "server-only": {}, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts"),
  });
  return { state, evaluate: (now) => evaluateAttendance(tx, 1n, null, now) };
}

test("check-in alone earns nothing before expiry and exactly one star at expiry, regardless of minimum minutes", async () => {
  const api = setup();
  const before = await api.evaluate(new Date(expiresAt.getTime() - 1));
  assert.equal(before.yellowStarPoints, 0);
  assert.equal(before.status, "ATTENDED");
  assert.equal(before.eligibilityStatus, "PENDING");
  assert.equal(api.state.star, null);
  const after = await api.evaluate(expiresAt);
  assert.equal(after.yellowStarPoints, 1);
  assert.equal(after.eligibilityStatus, "APPROVED");
  assert.equal(after.attendedMinutes, null, "no fabricated checkout or attendance duration");
  assert.equal(api.state.star.points, 1);
  assert.equal(api.state.star.academicYearId, 4n);
  await api.evaluate(new Date(expiresAt.getTime() + 10000));
  assert.equal(api.state.audits.length, 1);
});

test("a later QR expiry stays attached to the check-in; earlier expired sessions cannot award early", async () => {
  const later = new Date(expiresAt.getTime() + 60000);
  const api = setup({ due: later });
  assert.equal((await api.evaluate(expiresAt)).yellowStarPoints, 0);
  assert.equal((await api.evaluate(later)).yellowStarPoints, 1);
});

test("legacy check-ins resolve their QR expiry without requiring checkout", async () => {
  const api = setup({ due: null });
  assert.equal((await api.evaluate(expiresAt)).yellowStarPoints, 1);
  assert.equal(api.state.participation.reviewDueAt, expiresAt);
});

test("no check-in, future check-ins, nonstudents, unpublished activities and the yearly cap cannot earn a star", async () => {
  for (const options of [{ records: [] }, { records: [{ eventType: "CHECK_IN", occurredAt: new Date("2099-01-01Z") }] },
    { student: false }, { activityStatus: "DRAFT" }, { activityStatus: "CANCELLED" }, { used: 12 }]) {
    const api = setup(options);
    assert.equal((await api.evaluate(expiresAt)).yellowStarPoints, 0);
    assert.notEqual(api.state.star?.status, "APPROVED");
  }
  assert.equal((await setup({ used: 11 }).evaluate(expiresAt)).yellowStarPoints, 1);
});

test("cancelling an activity revokes its awarded star and restoring it reuses the same star", async () => {
  const api = setup();
  await api.evaluate(expiresAt);
  api.state.participation.activity.status = "CANCELLED";
  await api.evaluate(expiresAt);
  assert.equal(api.state.star.status, "REJECTED");
  api.state.participation.activity.status = "PUBLISHED";
  await api.evaluate(expiresAt);
  assert.equal(api.state.star.id, 5n);
  assert.equal(api.state.star.status, "APPROVED");
});

test("background processing skips closed years, already approved rows and future deadlines", async () => {
  let selection;
  let evaluated = 0;
  const tx = {
    $queryRaw: async () => [{ status: "ACTIVE" }],
    participation: {
      findMany: async (query) => { selection = query; return [{ id: 1n, activityId: 3n }]; },
      findUnique: async () => ({ eligibilityStatus: "PENDING" }),
    },
    auditLog: { create: async () => {} },
  };
  const { backfillAttendanceResults } = loadTypeScript("../lib/attendance.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (fn) => fn(tx) } },
    "@/lib/attendance-results": { lockAttendanceUser: async () => true, evaluateAttendance: async () => { evaluated++; return { yellowStarPoints: 1 }; } },
  });
  assert.deepEqual(await backfillAttendanceResults([1n], 3n), { processed: 1, approvedYellowStars: 1 });
  assert.equal(selection.where.activityId, 3n);
  assert.equal(evaluated, 1);
  assert.equal(selection.where.activity.academicYear.status.not, "CLOSED");
  assert.equal(selection.where.eligibilityStatus.not, "APPROVED");
  assert.deepEqual(selection.where.NOT, { eligibilityStatus: "REJECTED", reviewedBy: { not: null } });
  assert.ok(selection.where.OR[1].reviewDueAt.lte instanceof Date);
  assert.equal(selection.where.attendanceRecords.some.eventType, "CHECK_IN");
  assert.equal(selection.take, 250);
});

test("the check-in transaction revalidates QR expiry and stores the server session deadline", async () => {
  for (const valid of [true, false]) {
    let stored;
    let records = 0;
    const deadline = new Date(Date.now() + (valid ? 60000 : -1));
    const tx = {
      $queryRaw: async () => [{ status: "ACTIVE" }],
      qrSession: { findUnique: async () => ({ activityId: 3n, purpose: "CHECK_IN", revokedAt: null, expiresAt: deadline }) },
      participation: { findUniqueOrThrow: async () => ({ activityId: 3n }), update: async ({ data }) => { stored = data.reviewDueAt; } },
      attendanceRecord: { findMany: async () => [], create: async ({ data }) => { records++; return { id: 1n, ...data }; } },
      auditLog: { create: async () => {} },
    };
    const { recordAttendance } = loadTypeScript("../lib/attendance.ts", {
      "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (fn) => fn(tx) } },
      "@/lib/attendance-results": { lockAttendanceUser: async () => true, evaluateAttendance: async () => ({ yellowStarPoints: 0 }) },
    });
    const pending = recordAttendance({ participationId: 1n, eventType: "CHECK_IN", method: "QR", occurredAt: new Date(), recordedBy: 2n, qrSessionId: 9n });
    if (valid) {
      await pending;
      assert.equal(stored, deadline);
      assert.equal(records, 1);
    } else {
      await assert.rejects(pending, (error) => error.status === 400);
      assert.equal(records, 0);
    }
  }
});
