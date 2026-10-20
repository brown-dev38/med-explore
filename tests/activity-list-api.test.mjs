import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

test("activity refresh preserves the selected year and returns registration and both attendance times", async () => {
  const queries = [];
  const activities = [1n, 2n, 3n, 4n].map((id) => ({ id, _count: { participations: 1 } }));
  const checkIn = new Date("2026-10-20T04:00:00Z");
  const checkOut = new Date("2026-10-20T06:00:00Z");
  const mine = [
    { id: 11n, activityId: 1n, status: "REGISTERED", attendanceRecords: [] },
    { id: 12n, activityId: 2n, status: "REGISTERED", attendanceRecords: [{ eventType: "CHECK_IN", occurredAt: checkIn }] },
    { id: 13n, activityId: 3n, status: "ATTENDED", attendanceRecords: [{ eventType: "CHECK_OUT", occurredAt: checkOut }, { eventType: "CHECK_IN", occurredAt: checkIn }] },
  ];
  const { GET } = loadTypeScript("../app/api/activities/route.ts", {
    "@/lib/prisma": { prisma: {
      activity: { findMany: async (query) => { queries.push(query); return activities; } },
      participation: { findMany: async (query) => { queries.push(query); return mine; } },
    } },
    "@/lib/dal": { getCurrentUser: async () => ({ id: "7" }) },
    "@/lib/permissions": { hasPermission: () => false, PERMISSIONS: { ACTIVITY_MANAGE: "activity.manage" } },
    "@/lib/validation": {}, "@/lib/audit": {},
    "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/activities": { toActivityDto: (activity) => ({ id: String(activity.id) }) },
  });
  const response = await GET(new Request("https://example.test/api/activities?academicYearId=2"));
  const { data } = await response.json();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(queries[0].where, { status: "PUBLISHED", academicYearId: 2n });
  assert.equal(queries[0].orderBy.startsAt, "asc");
  assert.equal(queries[1].where.userId, 7n);
  assert.deepEqual(queries[1].select.attendanceRecords.select, { eventType: true, occurredAt: true });
  assert.deepEqual(data.map((item) => item.myParticipation), [
    { id: "11", status: "REGISTERED", checkInAt: null, checkOutAt: null },
    { id: "12", status: "REGISTERED", checkInAt: checkIn.toISOString(), checkOutAt: null },
    { id: "13", status: "ATTENDED", checkInAt: checkIn.toISOString(), checkOutAt: checkOut.toISOString() },
    null,
  ]);
});
