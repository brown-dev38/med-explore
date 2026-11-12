import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

test("an unlimited QR awards the thirteenth star in the check-in transaction and refuses duplicate scans", async () => {
  const now = new Date();
  const participation = {
    id: 13n, userId: 2n, activityId: 3n, reviewDueAt: null, eligibilityStatus: "PENDING", reviewedBy: null,
    activity: { id: 3n, academicYearId: 4n, status: "PUBLISHED", minMinutes: 90, endsAt: new Date(now.getTime() + 86400000) },
    attendanceRecords: [], user: { userRoles: [{ role: { name: "STUDENT" } }] },
  };
  const stars = new Map(Array.from({ length: 12 }, (_, index) => [BigInt(index + 1), {
    id: BigInt(index + 1), userId: 2n, academicYearId: 4n, points: 1, starType: "YELLOW", status: "APPROVED",
  }]));
  const audits = [];
  const tx = {
    $queryRaw: async () => [{ id: 2n, status: "ACTIVE" }],
    participation: {
      findUnique: async () => participation,
      findUniqueOrThrow: async () => participation,
      update: async ({ data }) => Object.assign(participation, data),
    },
    qrSession: { findUnique: async () => ({ id: 9n, activityId: 3n, purpose: "CHECK_IN", expiresAt: null, revokedAt: null }) },
    attendanceRecord: {
      findMany: async () => participation.attendanceRecords,
      create: async ({ data }) => { const record = { id: 1n, ...data }; participation.attendanceRecords.push(record); return record; },
    },
    starTransaction: {
      findUnique: async ({ where }) => stars.get(where.participationId_starType.participationId) ?? null,
      aggregate: async () => { throw new Error("Annual totals must not restrict awards"); },
      upsert: async ({ create, update }) => {
        const previous = stars.get(13n);
        const star = previous ? { ...previous, ...update } : { id: 13n, ...create };
        stars.set(13n, star); return star;
      },
    },
    auditLog: { create: async ({ data }) => audits.push(data) },
  };
  const results = loadTypeScript("../lib/attendance-results.ts", { "server-only": {}, "@/lib/attendance-calculation": loadTypeScript("../lib/attendance-calculation.ts") });
  const { recordAttendance } = loadTypeScript("../lib/attendance.ts", {
    "server-only": {}, "@/lib/attendance-results": results, "@/lib/prisma": { prisma: { $transaction: (callback) => callback(tx) } },
  });
  const scan = () => recordAttendance({ participationId: 13n, qrSessionId: 9n, eventType: "CHECK_IN", method: "QR", occurredAt: now, recordedBy: 2n });
  const result = await scan();
  assert.equal(result.evaluation.yellowStarPoints, 1);
  assert.equal(result.evaluation.eligibilityStatus, "APPROVED");
  assert.equal(result.evaluation.attendedMinutes, null);
  assert.equal([...stars.values()].reduce((total, star) => total + star.points, 0), 13);
  assert.ok(participation.reviewDueAt < participation.activity.endsAt);
  await assert.rejects(scan(), (error) => error.status === 409);
  assert.equal(participation.attendanceRecords.length, 1);
  assert.equal(stars.size, 13);
  assert.equal(audits.filter((audit) => audit.action === "star.auto_award").length, 1);
});
