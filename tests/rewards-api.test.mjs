import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const permissions = loadTypeScript("../lib/permissions.ts");
const validation = loadTypeScript("../lib/reward-validation.ts");
class RewardError extends Error { constructor(message, status) { super(message); this.status = status; } }
const reward = { academicYearId: "2", name: "Notebook", description: null, costPoints: 5, stockQuantity: 3, isActive: true };
const images = loadTypeScript("../lib/reward-images.ts", {
  "server-only": {}, "@/lib/rewards": { RewardError },
  "@/lib/reward-image-rules": loadTypeScript("../lib/reward-image-rules.ts"),
});
const exchange = { rewardTierId: "4", expectedCostPoints: 5, requestId: "f246e0ae-2ee2-45a0-b17b-86b3e6b18559" };

function routes(role) {
  const calls = [];
  const service = { RewardError };
  for (const name of ["createReward", "updateReward", "deleteReward", "requestRedemption", "reviewRedemption", "rewardCatalog"]) service[name] = async (...args) => { calls.push({ name, args }); return { id: "9", replayed: false }; };
  const shared = {
    "@/lib/dal": { getCurrentUser: async () => role ? { id: "7", roles: [role], permissions: [] } : null },
    "@/lib/permissions": permissions, "@/lib/rewards": service,
    "@/lib/reward-images": images,
    "@/lib/api": loadTypeScript("../lib/api.ts"), "@/lib/reward-validation": validation,
    "next/cache": { revalidatePath() {} },
  };
  shared["@/lib/reward-api"] = loadTypeScript("../lib/reward-api.ts", shared);
  const inventory = loadTypeScript("../app/api/rewards/route.ts", shared);
  const details = loadTypeScript("../app/api/rewards/[id]/route.ts", shared);
  const redemption = loadTypeScript("../app/api/reward-redemptions/route.ts", shared);
  const review = loadTypeScript("../app/api/reward-redemptions/[id]/route.ts", shared);
  const request = (method, body) => new Request("https://example.test/api/rewards", { method, body: body instanceof FormData || typeof body === "string" ? body : JSON.stringify(body) });
  return { calls, create: (body = reward) => inventory.POST(request("POST", body)),
    update: () => details.PATCH(request("PATCH", { ...reward, expectedStockQuantity: 3 }), { params: Promise.resolve({ id: "4" }) }),
    remove: () => details.DELETE(new Request("https://example.test", { method: "DELETE" }), { params: Promise.resolve({ id: "4" }) }),
    exchange: (body = exchange) => redemption.POST(request("POST", body)),
    review: (status, note = "") => review.PATCH(request("PATCH", { status, note }), { params: Promise.resolve({ id: "9" }) }),
  };
}

test("only ADMIN and ORGANIZER can manage inventory with existing sessions", async () => {
  for (const role of [null, "STUDENT", "OTHER", "ADMIN", "ORGANIZER"]) {
    const api = routes(role);
    const allowed = ["ADMIN", "ORGANIZER"].includes(role);
    assert.equal((await api.create()).status, allowed ? 201 : role ? 403 : 401);
    assert.equal((await api.update()).status, allowed ? 200 : role ? 403 : 401);
    assert.equal((await api.remove()).status, allowed ? 200 : role ? 403 : 401);
    if (!allowed) assert.equal(api.calls.length, 0);
  }
});

test("students request only their own redemption; supplied user, status and charge cannot override server values", async () => {
  const api = routes("STUDENT");
  assert.equal((await api.exchange({ ...exchange, userId: "999", costPoints: 0, status: "APPROVED", academicYearId: "999" })).status, 201);
  assert.deepEqual(api.calls[0], { name: "requestRedemption", args: [exchange, 7n] });
  for (const role of [null, "ADMIN", "ORGANIZER"]) assert.equal((await routes(role).exchange()).status, role ? 403 : 401);
});

test("students cannot approve or reject and staff must provide rejection reasons", async () => {
  const student = routes("STUDENT");
  for (const status of ["APPROVED", "COMPLETED", "REJECTED"]) assert.equal((await student.review(status, "Reason")).status, 403);
  assert.equal((await student.review("CANCELLED")).status, 200);
  for (const role of ["ADMIN", "ORGANIZER"]) {
    const api = routes(role);
    assert.equal((await api.review("REJECTED")).status, 400);
    assert.equal((await api.review("REJECTED", "Out of stock")).status, 200);
    assert.equal((await api.review("APPROVED")).status, 200);
  }
});

test("malformed JSON, IDs, negative stock, fractional prices and missing idempotency keys are rejected", async () => {
  const api = routes("ADMIN");
  for (const body of ["{", { ...reward, stockQuantity: -1 }, { ...reward, costPoints: 1.5 }, { ...reward, academicYearId: "9223372036854775808" }]) assert.equal((await api.create(body)).status, 400);
  const student = routes("STUDENT");
  for (const changes of [{ requestId: null }, { rewardTierId: "0" }, { expectedCostPoints: 0 }]) assert.equal((await student.exchange({ ...exchange, ...changes })).status, 400);
  assert.equal(api.calls.length, 0);
  assert.equal(student.calls.length, 0);
});

test("multipart image removals are staff-only and untrusted JSON cannot write image storage fields", async () => {
  const form = new FormData();
  form.set("data", JSON.stringify(reward));
  form.set("removeImage", "true");
  for (const role of [null, "STUDENT", "ADMIN", "ORGANIZER"]) {
    const api = routes(role);
    assert.equal((await api.create(form)).status, role === null ? 401 : role === "STUDENT" ? 403 : 201);
    if (api.calls.length) assert.deepEqual(api.calls[0].args[2], { imageData: null, imageMimeType: null, imageUpdatedAt: null });
  }
  const api = routes("ADMIN");
  assert.equal((await api.create({ ...reward, imageData: "spoof", imageMimeType: "image/svg+xml" })).status, 201);
  assert.deepEqual(api.calls[0].args, [reward, 7n, undefined]);
});
