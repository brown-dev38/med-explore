import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

function setup({ closed = false, starFails = false, auditFails = false } = {}) {
  const state = { helpers: [], stars: [], audits: [] };
  const activity = { id: 4n, academicYearId: 2n, title: "Activity help" };
  const student = { username: "student", studentCode: "001234", email: "student@example.test" };
  const match = (helper, where) => helper.activityId === where.activityId && where.userId.in.includes(helper.userId);
  const db = {
    $queryRaw: async () => [{ status: closed ? "CLOSED" : "ACTIVE" }],
    activity: { findUniqueOrThrow: async () => activity },
    helperAssignment: {
      findMany: async ({ where }) => state.helpers.filter((helper) => match(helper, where)),
      findUnique: async ({ where: { activityId_userId: key } }) => state.helpers.find((helper) => helper.activityId === key.activityId && helper.userId === key.userId) ?? null,
      createMany: async ({ data }) => {
        for (const row of data) {
          if (state.helpers.some((helper) => helper.activityId === row.activityId && helper.userId === row.userId)) throw new Error("DUPLICATE_HELPER");
          state.helpers.push({ ...row, id: BigInt(state.helpers.length + 1), createdAt: new Date() });
        }
        return { count: data.length };
      },
      findUniqueOrThrow: async ({ where: { activityId_userId: key } }) => {
        const helper = state.helpers.find((helper) => helper.activityId === key.activityId && helper.userId === key.userId);
        assert.ok(helper);
        return { ...helper, activity, student, starTransactions: state.stars.filter((star) => star.helperAssignmentId === helper.id) };
      },
    },
    starTransaction: { createMany: async ({ data }) => {
      if (starFails) throw new Error("STAR_FAILED");
      state.stars.push(...data);
      return { count: data.length };
    } },
    auditLog: { create: async ({ data }) => {
      if (auditFails) throw new Error("AUDIT_FAILED");
      state.audits.push(data);
    } },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      const before = structuredClone(state);
      try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
    },
  };
  const helpers = loadTypeScript("../lib/helpers.ts", {
    "server-only": {}, "@/lib/audit": {}, "@/lib/prisma": { prisma: db },
    "@/lib/helper-awards": loadTypeScript("../lib/helper-awards.ts"),
  });
  return { state, ...helpers };
}

test("adding a helper immediately returns completed status and one approved star in the activity year", async () => {
  const api = setup();
  const helper = await api.assignHelper(4n, 42n, 7n, "Registration desk");
  assert.equal(helper.status, "COMPLETED");
  assert.equal(helper.greenStarPoints, 1);
  assert.equal(helper.greenStarAwarded, true);
  assert.ok(helper.completedAt);
  assert.equal(api.state.stars[0].academicYearId, 2n);
  assert.equal(api.state.stars[0].approvedBy, 7n);
  await assert.rejects(api.assignHelper(4n, 42n, 7n), (error) => error.code === "P2002");
  assert.equal(api.state.stars.length, 1);
});

test("bulk addition awards only new helpers and never restores cancelled helpers or duplicates stars", async () => {
  const api = setup();
  api.state.helpers.push({ id: 1n, activityId: 4n, userId: 40n, status: "CANCELLED" });
  assert.deepEqual(await api.bulkAssignHelpers(4n, [40n, 42n, 42n, 43n], 7n), { added: 2 });
  assert.equal(api.state.helpers[0].status, "CANCELLED");
  assert.deepEqual(api.state.stars.map((star) => star.userId), [42n, 43n]);
  assert.ok(api.state.stars.every((star) => star.points === 1 && star.starType === "GREEN" && star.status === "APPROVED"));
  assert.deepEqual(await api.bulkAssignHelpers(4n, [40n, 42n, 43n], 7n), { added: 0 });
  assert.equal(api.state.stars.length, 2);
});

test("closed years and star or audit failures cannot leave partially added helpers or stars", async () => {
  for (const options of [{ closed: true }, { starFails: true }, { auditFails: true }]) {
    for (const bulk of [false, true]) {
      const api = setup(options);
      await assert.rejects(bulk ? api.bulkAssignHelpers(4n, [42n, 43n], 7n) : api.assignHelper(4n, 42n, 7n));
      assert.deepEqual(api.state, { helpers: [], stars: [], audits: [] });
    }
  }
});
