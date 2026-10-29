import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const qr = loadTypeScript("../lib/qr.ts", { "server-only": {} });
const active = { id: 9n, activityId: 4n, purpose: "CHECK_IN", tokenHash: qr.hashQrToken("original-token"), expiresAt: new Date("2099-01-01Z"), revokedAt: null };
function setup(principal = { id: "1", roles: ["ADMIN"], permissions: [] }, session = active) {
  const queries = [];
  const { GET } = loadTypeScript("../app/api/qr-sessions/[id]/route.ts", {
    "@/lib/prisma": { prisma: { qrSession: { findFirst: async (query) => {
      queries.push(query);
      return session && Object.entries(query.where).every(([key, value]) => key === "expiresAt"
        ? session.expiresAt > value.gt : session[key] === value) ? session : null;
    } } } },
    "@/lib/dal": { getCurrentUser: async () => principal },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"), "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/audit": {}, "@/lib/qr": qr,
  });
  return { queries, get: (id = "9", activityId = "4", token = "original-token") => GET(
    new Request(`https://example.test/api/qr-sessions/${id}?activityId=${activityId}`, { headers: token ? { "X-QR-Token": token } : {} }),
    { params: Promise.resolve({ id }) },
  ) };
}

test("staff restore validation returns only the original active session metadata without changing its deadline", async () => {
  for (const roles of [["ADMIN"], ["ORGANIZER"]]) {
    const api = setup({ id: "1", roles, permissions: ["activity.manage"] });
    const response = await api.get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual((await response.json()).data, { id: "9", activityId: "4", purpose: "CHECK_IN", expiresAt: active.expiresAt.toISOString() });
    assert.equal(api.queries[0].where.tokenHash, qr.hashQrToken("original-token"));
    assert.equal(api.queries[0].where.revokedAt, null);
    assert.ok(api.queries[0].where.expiresAt.gt instanceof Date);
  }
});

test("guests and students cannot inspect cached QR sessions", async () => {
  for (const principal of [null, { id: "2", roles: ["STUDENT"], permissions: [] }]) {
    const api = setup(principal);
    assert.equal((await api.get()).status, principal ? 403 : 401);
    assert.equal(api.queries.length, 0);
  }
});

test("revoked, expired, different-activity, wrong-token and checkout QRs cannot be restored", async () => {
  for (const changes of [{ revokedAt: new Date() }, { expiresAt: new Date(0) }, { activityId: 5n }, { tokenHash: "different" }, { purpose: "CHECK_OUT" }]) {
    const response = await setup(undefined, { ...active, ...changes }).get();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data, null);
  }
});

test("malformed IDs and missing tokens are rejected before accessing the database", async () => {
  for (const [id, activityId, token] of [["invalid", "4", "t"], ["0", "4", "t"], ["9", "0", "t"], ["9223372036854775808", "4", "t"], ["9", "4", ""], ["9", "4", "t".repeat(257)]]) {
    const api = setup();
    assert.equal((await api.get(id, activityId, token)).status, 400);
    assert.equal(api.queries.length, 0);
  }
});
