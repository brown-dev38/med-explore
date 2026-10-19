import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/validation.ts");
const api = loadTypeScript("../lib/api.ts");
const actor = (role) => ({ id: "7", roles: [role], permissions: role === "ORGANIZER" ? ["activity.manage", "star.approve"] : [] });

function routes(principal, { validStudent = true, belongs = true, conflict = false } = {}) {
  const calls = [];
  const mocks = {
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions, "@/lib/validation": validation, "@/lib/api": api,
    "@/lib/prisma": { prisma: {
      activity: { findUnique: async () => ({ id: 4n }) },
      user: {
        findFirst: async (query) => { calls.push({ type: "student", query }); return validStudent ? { id: 42n } : null; },
        count: async ({ where }) => validStudent ? where.id.in.length : 0,
      },
      helperAssignment: {
        findUnique: async () => null,
        findFirst: async (query) => { calls.push({ type: "belongs", query }); return belongs ? { id: 9n } : null; },
      },
    } },
    "@/lib/helpers": {
      getHelpersForActivity: async (id) => { calls.push({ type: "list", id }); return []; },
      getHelperCandidates: async (id, query) => { calls.push({ type: "candidates", id, query }); return []; },
      assignHelper: async (...args) => { if (conflict) throw { code: "P2002" }; calls.push({ type: "assign", args }); return { id: "9" }; },
      bulkAssignHelpers: async (...args) => { calls.push({ type: "bulk", args }); return { added: args[1].length }; },
      updateHelperStatusAndStar: async (...args) => { calls.push({ type: "status", args }); return { id: "9", greenStarPoints: 1 }; },
      removeHelper: async (...args) => { calls.push({ type: "remove", args }); },
    },
  };
  const collection = loadTypeScript("../app/api/activities/[id]/helpers/route.ts", mocks);
  const candidate = loadTypeScript("../app/api/activities/[id]/helpers/candidates/route.ts", mocks);
  const detail = loadTypeScript("../app/api/activities/[id]/helpers/[helperId]/route.ts", mocks);
  const context = () => ({ params: Promise.resolve({ id: "4", helperId: "9" }) });
  const request = (method, body) => new Request("https://example.test/api/activities/4/helpers/9", { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { calls,
    list: () => collection.GET(request("GET"), context()),
    candidates: () => candidate.GET(request("GET"), context()),
    assign: (body = { userId: "42", description: "Registration desk" }) => collection.POST(request("POST", body), context()),
    award: (body = { status: "COMPLETED", points: 999, userId: "999", academicYearId: "999" }) => detail.PATCH(request("PATCH", body), context()),
    remove: () => detail.DELETE(request("DELETE"), context()),
  };
}

test("ADMIN and ORGANIZER can list, find, assign and award green stars through the existing helper endpoints", async () => {
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const handlers = routes(actor(role));
    assert.equal((await handlers.list()).status, 200);
    assert.equal((await handlers.candidates()).status, 200);
    assert.equal((await handlers.assign()).status, 201);
    assert.equal((await handlers.award()).status, 200);
    assert.deepEqual(handlers.calls.find((call) => call.type === "assign").args, [4n, 42n, 7n, "Registration desk"]);
    assert.deepEqual(handlers.calls.find((call) => call.type === "status").args, [9n, "COMPLETED", 7n, undefined]);
    const studentQuery = handlers.calls.find((call) => call.type === "student").query;
    assert.equal(studentQuery.where.isActive, true);
    assert.deepEqual(studentQuery.where.userRoles, { some: { role: { name: "STUDENT" } } });
  }
});

test("students and guests cannot access or mutate helper records", async () => {
  for (const principal of [null, actor("STUDENT")]) {
    const handlers = routes(principal);
    for (const action of ["list", "candidates", "assign", "award", "remove"]) assert.equal((await handlers[action]()).status, principal ? 403 : 401);
    assert.deepEqual(handlers.calls, []);
  }
});

test("inactive or nonstudent targets cannot be assigned, including in bulk requests", async () => {
  const handlers = routes(actor("ADMIN"), { validStudent: false });
  assert.equal((await handlers.assign()).status, 400);
  assert.equal((await handlers.assign({ userIds: ["42", "43"] })).status, 400);
  assert.ok(!handlers.calls.some((call) => ["assign", "bulk"].includes(call.type)));
});

test("bulk assignment rejects malformed IDs and deduplicates valid students", async () => {
  for (const id of ["invalid", "0", "-1", "9223372036854775808"]) {
    const handlers = routes(actor("ORGANIZER"));
    assert.equal((await handlers.assign({ userIds: ["42", id] })).status, 400);
    assert.ok(!handlers.calls.some((call) => call.type === "bulk"));
  }
  const handlers = routes(actor("ORGANIZER"));
  assert.equal((await handlers.assign({ userIds: ["42", "42", "43"] })).status, 201);
  assert.deepEqual(handlers.calls.find((call) => call.type === "bulk").args[1], [42n, 43n]);
});

test("a helper ID from another activity cannot be changed or removed", async () => {
  const handlers = routes(actor("ADMIN"), { belongs: false });
  assert.equal((await handlers.award()).status, 404);
  assert.equal((await handlers.remove()).status, 404);
  assert.ok(!handlers.calls.some((call) => ["status", "remove"].includes(call.type)));
  for (const { query } of handlers.calls) assert.deepEqual(query.where, { id: 9n, activityId: 4n });
});

test("racing duplicate assignments return a conflict", async () => {
  assert.equal((await routes(actor("ADMIN"), { conflict: true }).assign()).status, 409);
});

test("candidate lookup returns only active students who are not already assigned", async () => {
  let query;
  const helpers = loadTypeScript("../lib/helpers.ts", {
    "server-only": {}, "@/lib/audit": {},
    "@/lib/prisma": { prisma: {
      helperAssignment: { findMany: async () => [{ userId: 42n }] },
      user: { findMany: async (input) => { query = input; return []; } },
    } },
  });
  assert.deepEqual(await helpers.getHelperCandidates(4n, "  Student  "), []);
  assert.equal(query.where.isActive, true);
  assert.deepEqual(query.where.id.notIn, [42n]);
  assert.deepEqual(query.where.userRoles, { some: { role: { name: "STUDENT" } } });
  assert.ok(query.where.OR.some((item) => item.studentCode?.contains === "Student"));
});

test("completion awards exactly one green star per helper in its activity's year; cancellation revokes it", async () => {
  let helper = {
    id: 9n, activityId: 4n, userId: 42n, assignedBy: 7n, status: "ASSIGNED", description: null, completedAt: null, createdAt: new Date(),
    student: { username: "student42", firstname: "Student", lastname: "42", studentCode: "690042", email: "student@example.test" },
    activity: { title: "Student service", academicYearId: 2n },
  };
  const stars = new Map();
  const tx = {
    $queryRaw: async () => [{ status: "ACTIVE" }],
    helperAssignment: {
      update: async ({ data }) => { helper = { ...helper, ...data }; return { ...helper, starTransactions: [...stars.values()] }; },
      findUniqueOrThrow: async () => ({ ...helper, starTransactions: [...stars.values()] }),
    },
    starTransaction: {
      upsert: async ({ where, create, update }) => {
        assert.deepEqual(where, { helperAssignmentId_starType: { helperAssignmentId: 9n, starType: "GREEN" } });
        stars.set("9:GREEN", stars.has("9:GREEN") ? { ...stars.get("9:GREEN"), ...update } : create);
      },
      deleteMany: async () => stars.clear(),
    },
  };
  const helpers = loadTypeScript("../lib/helpers.ts", {
    "server-only": {}, "@/lib/audit": { recordAudit: async () => {} },
    "@/lib/prisma": { prisma: { helperAssignment: { findUnique: async () => helper }, $transaction: (fn) => fn(tx) } },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await helpers.updateHelperStatusAndStar(9n, "COMPLETED", 7n);
    assert.equal(result.greenStarPoints, 1);
    assert.equal(stars.size, 1);
  }
  assert.equal(stars.get("9:GREEN").userId, 42n);
  assert.equal(stars.get("9:GREEN").academicYearId, 2n);
  const cancelled = await helpers.updateHelperStatusAndStar(9n, "CANCELLED", 7n);
  assert.equal(cancelled.greenStarPoints, 0);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(stars.size, 0);
});
