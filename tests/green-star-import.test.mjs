import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const input = { target: { mode: "work", academicYearId: "2" }, studentCodes: ["001234", "001235"], description: "Help prepare faculty documents", requestId: "7a095e62-eaf5-4b0b-8dd1-938f019787d0" };
const students = [42n, 43n].map((id, index) => ({ id, studentCode: `00123${index + 4}`, firstname: "Student", lastname: String(id), username: `student${id}` }));

function service({ authorized = true, yearStatus = "ACTIVE", missingStudent = false, wrongActivity = false, auditFails = false, conflictOnce = false } = {}) {
  const state = { stars: [], helpers: [], receipts: [], queries: [], transactions: 0 };
  let queue = Promise.resolve();
  const db = {
    $queryRaw: async (_sql, id) => { assert.equal(id, 7n); },
    user: {
      findFirst: async () => authorized ? { id: 7n } : null,
      findMany: async (query) => { state.queries.push(query); return (missingStudent ? students.slice(0, 1) : students).filter((student) => query.where.studentCode.in.includes(student.studentCode)); },
    },
    academicYear: { findUnique: async () => yearStatus ? { status: yearStatus } : null },
    activity: { findUnique: async () => ({ academicYearId: wrongActivity ? 999n : 2n }) },
    starTransaction: { createMany: async ({ data }) => { state.stars.push(...data); return { count: data.length }; } },
    helperAssignment: {
      findMany: async () => state.helpers.map(({ userId }) => ({ userId })),
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        const added = data.filter((row) => !state.helpers.some((existing) => existing.activityId === row.activityId && existing.userId === row.userId));
        state.helpers.push(...added);
        return { count: added.length };
      },
    },
    auditLog: {
      findFirst: async ({ where }) => state.receipts.find((entry) => entry.actorId === where.actorId && entry.action === where.action && entry.details.requestId === where.details.equals) ?? null,
      create: async ({ data }) => { if (auditFails) throw new Error("AUDIT_FAILED"); state.receipts.push(data); },
    },
    $transaction: (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      const pending = queue.then(async () => {
        state.transactions++;
        if (conflictOnce && state.transactions === 1) throw Object.assign(new Error("CONFLICT"), { code: "P2034" });
        const before = structuredClone({ stars: state.stars, helpers: state.helpers, receipts: state.receipts });
        try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
      });
      queue = pending.catch(() => {});
      return pending;
    },
  };
  return { state, ...loadTypeScript("../lib/green-star-import.ts", { "server-only": {}, "@/lib/prisma": { prisma: db } }) };
}

test("preview matches exact student codes and reports unknown, duplicate and already assigned rows without writes", async () => {
  const api = service();
  api.state.helpers.push({ activityId: 4n, userId: 42n });
  const rows = [
    { row: 2, studentCode: "001234", status: "ready" }, { row: 3, studentCode: "001235", status: "ready" },
    { row: 4, studentCode: "1234", status: "ready" }, { row: 5, studentCode: "001235", status: "duplicate" },
  ];
  const result = await api.previewGreenStarImport({ mode: "activity", academicYearId: "2", activityId: "4" }, rows);
  assert.deepEqual(result.map((row) => row.status), ["assigned", "ready", "not-found", "duplicate"]);
  assert.equal(result[1].name, "Student 43");
  assert.equal(api.state.stars.length, 0);
  assert.equal(api.state.transactions, 0);
  const query = api.state.queries[0];
  assert.equal(query.where.isActive, true);
  assert.deepEqual(query.where.userRoles, { some: { role: { name: "STUDENT" } } });
});

test("one confirmation awards exactly one green star per student and simultaneous retries do not award again", async () => {
  const api = service();
  const results = await Promise.all([api.confirmGreenStarImport(input, 7n), api.confirmGreenStarImport(input, 7n)]);
  assert.deepEqual(results, [{ imported: 2, replayed: false }, { imported: 2, replayed: true }]);
  assert.equal(api.state.stars.length, 2);
  assert.equal(api.state.receipts.length, 1);
  for (const star of api.state.stars) {
    assert.equal(star.points, 1);
    assert.equal(star.starType, "GREEN");
    assert.equal(star.status, "APPROVED");
    assert.equal(star.academicYearId, 2n);
    assert.equal(star.approvedBy, 7n);
    assert.equal(star.reason, input.description);
    assert.equal(star.helperAssignmentId, undefined);
  }
  assert.equal(api.state.receipts[0].action, "star.import_green_work");
  await assert.rejects(api.confirmGreenStarImport({ ...input, description: "Different work" }, 7n), (error) => error.status === 409);
  assert.equal(api.state.stars.length, 2);
});

test("activity import assigns helpers without giving stars or duplicating existing and cancelled assignments", async () => {
  const api = service();
  api.state.helpers.push({ activityId: 4n, userId: 42n, status: "CANCELLED" });
  const request = { ...input, target: { mode: "activity", academicYearId: "2", activityId: "4" } };
  assert.deepEqual(await api.confirmGreenStarImport(request, 7n), { imported: 1, replayed: false });
  assert.equal(api.state.helpers.length, 2);
  assert.equal(api.state.helpers[0].status, "CANCELLED");
  assert.equal(api.state.helpers[1].status, "ASSIGNED");
  assert.equal(api.state.helpers[1].description, input.description);
  assert.equal(api.state.stars.length, 0);
  assert.deepEqual(await api.confirmGreenStarImport(request, 7n), { imported: 1, replayed: true });
});

test("changed permissions, closed or missing years, mismatched activities and unavailable students prevent every write", async () => {
  for (const [options, status] of [[{ authorized: false }, 403], [{ yearStatus: "CLOSED" }, 409], [{ yearStatus: null }, 404], [{ wrongActivity: true }, 404], [{ missingStudent: true }, 409]]) {
    const api = service(options);
    await assert.rejects(api.confirmGreenStarImport({ ...input, target: { mode: "activity", academicYearId: "2", activityId: "4" } }, 7n), (error) => error.status === status);
    assert.equal(api.state.stars.length, 0);
    assert.equal(api.state.helpers.length, 0);
    assert.equal(api.state.receipts.length, 0);
  }
});

test("audit failures roll the entire import back and serialization conflicts retry safely", async () => {
  const api = service({ auditFails: true });
  await assert.rejects(api.confirmGreenStarImport(input, 7n), /AUDIT_FAILED/);
  assert.equal(api.state.stars.length, 0);
  assert.equal(api.state.receipts.length, 0);
  const retry = service({ conflictOnce: true });
  assert.deepEqual(await retry.confirmGreenStarImport(input, 7n), { imported: 2, replayed: false });
  assert.equal(retry.state.transactions, 2);
  assert.equal(retry.state.stars.length, 2);
});
