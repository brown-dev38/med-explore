import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const input = { userId: "42", academicYearId: "2", description: "Help prepare faculty documents", requestId: "f246e0ae-2ee2-45a0-b17b-86b3e6b18559" };
const actor = (role) => ({ id: "7", roles: [role], permissions: [] });

function service({ student = true, authorized = true, yearStatus = "ACTIVE", failAudit = false } = {}) {
  const state = { stars: [], receipts: [], calls: [], transactions: 0 };
  let queue = Promise.resolve();
  const tx = {
    $queryRaw: async (sql, actorId) => { state.calls.push({ type: "lock", actorId, sql: sql.join("?") }); },
    user: { findFirst: async ({ where }) => where.id === 7n ? authorized ? { id: 7n } : null : student ? { id: 42n } : null },
    academicYear: { findUnique: async () => yearStatus ? { id: 2n, status: yearStatus } : null },
    auditLog: {
      findFirst: async ({ where }) => state.receipts.find((entry) => entry.actorId === where.actorId && entry.details.requestId === where.details.equals) ?? null,
      create: async ({ data }) => { if (failAudit) throw new Error("AUDIT_FAILED"); state.receipts.push(data); },
    },
    starTransaction: {
      create: async ({ data }) => { const created = { id: BigInt(state.stars.length + 1), ...data }; state.stars.push(created); return created; },
      findUnique: async ({ where }) => state.stars.find((star) => star.id === where.id) ?? null,
    },
  };
  const api = loadTypeScript("../lib/green-star-work.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: { $transaction: (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      const pending = queue.then(async () => {
        state.transactions++;
        const snapshot = structuredClone({ stars: state.stars, receipts: state.receipts });
        try { return await fn(tx); } catch (error) { state.stars = snapshot.stars; state.receipts = snapshot.receipts; throw error; }
      });
      queue = pending.catch(() => {});
      return pending;
    } } },
  });
  return { ...api, state };
}

test("standalone work awards one green star without a linked activity or helper assignment", async () => {
  const api = service();
  assert.deepEqual(await api.awardStandaloneGreenStar(input, 7n), { id: "1", points: 1, replayed: false });
  const star = api.state.stars[0];
  assert.equal(star.userId, 42n);
  assert.equal(star.academicYearId, 2n);
  assert.equal(star.points, 1);
  assert.equal(star.starType, "GREEN");
  assert.equal(star.status, "APPROVED");
  assert.equal(star.reason, input.description);
  assert.equal(star.helperAssignmentId, undefined);
  assert.equal(star.participationId, undefined);
  assert.equal(api.state.receipts[0].details.requestId, input.requestId);
  assert.equal(api.state.calls[0].actorId, 7n);
  assert.match(api.state.calls[0].sql, /FOR UPDATE/);
});

test("duplicate or simultaneous retries return the same work award", async () => {
  const api = service();
  const results = await Promise.all([api.awardStandaloneGreenStar(input, 7n), api.awardStandaloneGreenStar(input, 7n)]);
  assert.deepEqual(results.map((result) => result.id), ["1", "1"]);
  assert.equal(results[1].replayed, true);
  assert.equal(api.state.stars.length, 1);
  assert.equal(api.state.receipts.length, 1);
  await assert.rejects(api.awardStandaloneGreenStar({ ...input, description: "Changed work" }, 7n), (error) => error.status === 409);
  assert.equal(api.state.stars.length, 1);
});

test("closed or missing years, inactive/nonstudent targets and revoked staff roles cannot receive or grant awards", async () => {
  for (const [options, status] of [[{ yearStatus: "CLOSED" }, 409], [{ yearStatus: null }, 404], [{ student: false }, 400], [{ authorized: false }, 403]]) {
    const api = service(options);
    await assert.rejects(api.awardStandaloneGreenStar(input, 7n), (error) => error.status === status);
    assert.equal(api.state.stars.length, 0);
    assert.equal(api.state.receipts.length, 0);
  }
});

test("audit failure rolls back the award instead of leaving an untracked star", async () => {
  const api = service({ failAudit: true });
  await assert.rejects(api.awardStandaloneGreenStar(input, 7n), /AUDIT_FAILED/);
  assert.equal(api.state.stars.length, 0);
  assert.equal(api.state.receipts.length, 0);
});

test("standalone API authorizes only ADMIN and ORGANIZER and ignores client-supplied points", async () => {
  for (const role of ["ADMIN", "ORGANIZER", "STUDENT", "UNKNOWN", null]) {
    const calls = [];
    const route = loadTypeScript("../app/api/green-stars/route.ts", {
      "@/lib/dal": { getCurrentUser: async () => role ? actor(role) : null },
      "@/lib/permissions": permissions, "@/lib/validation": validation, "@/lib/api": loadTypeScript("../lib/api.ts"),
      "@/lib/green-star-work": { GreenStarWorkError: class extends Error {}, awardStandaloneGreenStar: async (...args) => { calls.push(args); return { id: "1", points: 1, replayed: false }; } },
    });
    const response = await route.POST(new Request("https://example.test/api/green-stars", { method: "POST", body: JSON.stringify({ ...input, points: 999, activityId: "999", approvedBy: "999" }) }));
    assert.equal(response.status, !role ? 401 : ["ADMIN", "ORGANIZER"].includes(role) ? 201 : 403);
    if (calls.length) assert.deepEqual(calls[0], [input, 7n]);
  }
});

test("standalone award validation rejects invalid IDs, empty work and missing request IDs without throwing", () => {
  for (const userId of ["invalid", "", "0", "-1", "1.5", "9223372036854775808", "9".repeat(100)]) {
    assert.equal(validation.greenWorkAwardSchema.safeParse({ ...input, userId }).success, false);
  }
  for (const changes of [{ description: " " }, { description: "x".repeat(1001) }, { requestId: "invalid" }, { requestId: undefined }]) {
    assert.equal(validation.greenWorkAwardSchema.safeParse({ ...input, ...changes }).success, false);
  }
});

test("standalone history stays within its year and excludes activity-linked stars", async () => {
  const calls = [];
  const api = loadTypeScript("../lib/green-star-work.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: { starTransaction: {
      count: async (query) => { calls.push(query); return 25; },
      findMany: async (query) => { calls.push(query); return []; },
    } } },
  });
  const result = await api.getStandaloneGreenStarRecords("2", "Student", 999);
  assert.equal(result.page, 2);
  assert.equal(calls[1].skip, 20);
  for (const { where } of calls) {
    assert.equal(where.academicYearId, 2n);
    assert.equal(where.starType, "GREEN");
    assert.equal(where.helperAssignmentId, null);
    assert.equal(where.participationId, null);
  }
});
