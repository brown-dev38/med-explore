import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

function dal(session) {
  return loadTypeScript("../lib/dal.ts", {
    "server-only": {},
    react: { cache: (fn) => fn },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/auth": { auth: async () => session },
    "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
    "@/lib/session-notices": loadTypeScript("../lib/session-notices.ts"),
  });
}

test("server navigation preserves the suspension or deletion notice when redirecting to login", async () => {
  for (const [accountStatus, reason] of [["SUSPENDED", "account-suspended"], ["DELETED", "account-deleted"]]) {
    const api = dal({ accountStatus, user: { id: "", roles: [], permissions: [] } });
    assert.equal(await api.getCurrentUser(), null);
    await assert.rejects(api.requireAuth(), { message: `REDIRECT:/login?reason=${reason}` });
  }
});

test("expired sessions and active users retain their normal server navigation behavior", async () => {
  await assert.rejects(dal(null).requireAuth(), { message: "REDIRECT:/login" });
  const api = dal({ accountStatus: "ACTIVE", user: { id: "2", role: "STUDENT", roles: ["STUDENT"], permissions: [] } });
  assert.equal((await api.requireAuth()).id, "2");
});

test("automatic sign-out sends CSRF and an abort signal to both requests", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith("csrf") ? { csrfToken: "test-token" } : { url: "/login" });
  });
  const api = loadTypeScript("../lib/auth-client.ts");
  const controller = new AbortController();
  await api.signOutClient("/login?reason=account-suspended", controller.signal);
  assert.deepEqual(calls.map((call) => call.url), ["/api/auth/csrf", "/api/auth/signout"]);
  assert.ok(calls.every((call) => call.options.signal === controller.signal));
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.body.get("csrfToken"), "test-token");
  assert.equal(calls[1].options.body.get("callbackUrl"), "/login?reason=account-suspended");
});
