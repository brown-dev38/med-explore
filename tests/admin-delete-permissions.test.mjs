import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const api = {
  successResponse: (data, status = 200) => Response.json({ success: true, data }, { status }),
  errorResponse: (message, status) => Response.json({ message }, { status }),
  parseId: (value) => /^\d+$/.test(value) ? BigInt(value) : null,
};

function routes(principal) {
  const calls = [];
  const mocks = {
    "@/lib/prisma": { prisma: {} },
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": permissions,
    "@/lib/validation": {},
    "@/lib/audit": {},
    "@/lib/api": api,
    "@/lib/activities": {},
    "@/lib/attendance": {},
    "@/lib/academic-years": {},
    "@/lib/admin-deletion": {
      DeletionError: class extends Error {},
      deleteActivity: async (id, actor, allowHistory) => { calls.push({ type: "activity", allowHistory, actor }); return { id: String(id) }; },
      deleteAcademicYear: async (id, actor) => { calls.push({ type: "year", actor }); return { id: String(id) }; },
    },
  };
  const activity = loadTypeScript("../app/api/activities/[id]/route.ts", mocks);
  const year = loadTypeScript("../app/api/academic-years/[id]/route.ts", mocks);
  const request = new Request("http://localhost/api/activities/1?isAdmin=true", { method: "DELETE" });
  const context = () => ({ params: Promise.resolve({ id: "1" }) });
  return { calls, activity: () => activity.DELETE(request, context()), year: () => year.DELETE(request, context()) };
}

test("delete endpoints reject unauthenticated and student requests before touching data", async () => {
  for (const principal of [null, { id: "1", roles: ["STUDENT"] }]) {
    const handlers = routes(principal);
    assert.equal((await handlers.activity()).status, principal ? 403 : 401);
    assert.equal((await handlers.year()).status, principal ? 403 : 401);
    assert.deepEqual(handlers.calls, []);
  }
});

test("only ADMIN can delete years, even if another role has management permissions", async () => {
  const handlers = routes({ id: "1", roles: ["ORGANIZER"], permissions: ["academic_year.manage", "activity.manage"] });
  assert.equal((await handlers.year()).status, 403);
  assert.equal((await handlers.activity()).status, 200);
  assert.deepEqual(handlers.calls, [{ type: "activity", actor: 1n, allowHistory: false }]);
});

test("ADMIN gets full deletion capabilities from the server role, not request flags", async () => {
  const handlers = routes({ id: "1", roles: ["ADMIN"], permissions: [] });
  assert.equal((await handlers.activity()).status, 200);
  assert.equal((await handlers.year()).status, 200);
  assert.deepEqual(handlers.calls, [{ type: "activity", actor: 1n, allowHistory: true }, { type: "year", actor: 1n }]);
});
