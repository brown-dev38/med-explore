import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";
import { reactHarness, nodes, text } from "./activity-live-harness.mjs";

function button(t, signOut) {
  const harness = reactHarness();
  const redirects = [], errors = [], timers = new Map();
  let timerId = 0;
  const old = globalThis.window;
  globalThis.window = { location: { replace: (url) => redirects.push(url) },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  const { LogoutButton } = loadTypeScript("../components/logout-button.tsx", {
    react: harness.react, "lucide-react": {}, sonner: { toast: { error: (message) => errors.push(message) } },
    "@/lib/auth-client": { signOutClient: signOut },
    "@/components/ui/button": { Button: "Button" }, "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/components/ui/tooltip": { Tooltip: "Tooltip", TooltipContent: "TooltipContent", TooltipTrigger: "TooltipTrigger" },
  });
  const render = (iconOnly = false) => harness.render(() => LogoutButton({ iconOnly }));
  return { render, redirects, errors, timers,
    confirm: () => nodes(render()).find((node) => node.type === "ConfirmDialog").props.onConfirm(),
  };
}

test("logout waits for confirmation, blocks duplicate requests, loads a fresh home page and clears its loading state", async (t) => {
  let finish, calls = 0;
  const ui = button(t, async (url, signal) => { calls++; assert.equal(url, "/"); assert.ok(signal instanceof AbortSignal); return new Promise((resolve) => { finish = resolve; }); });
  nodes(ui.render()).find((node) => node.type === "Button").props.onClick();
  assert.equal(calls, 0);
  assert.equal(nodes(ui.render()).find((node) => node.type === "ConfirmDialog").props.open, true);
  const pending = ui.confirm();
  assert.equal(await ui.confirm(), false);
  assert.equal(calls, 1);
  assert.ok(text(ui.render()).includes("กำลังออกจากระบบ..."));
  assert.equal(nodes(ui.render()).find((node) => node.type === "Button").props.disabled, true);
  assert.equal(ui.redirects.length, 0);
  finish();
  assert.equal(await pending, true);
  assert.deepEqual(ui.redirects, ["/"]);
  assert.equal(ui.timers.size, 0);
  assert.equal(nodes(ui.render()).find((node) => node.type === "Button").props.disabled, false);
  assert.equal(text(ui.render()).includes("กำลังออกจากระบบ..."), false);
});

test("an eight-second timeout aborts logout, restores both button variants and allows retry", async (t) => {
  let retry = false;
  const ui = button(t, async (_url, signal) => {
    if (retry) return;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  const pending = ui.confirm();
  const timeout = [...ui.timers.values()][0];
  assert.equal(timeout.ms, 8000);
  timeout.fn();
  assert.equal(await pending, false);
  assert.equal(ui.errors.length, 1);
  assert.equal(ui.redirects.length, 0);
  assert.equal(text(ui.render()).includes("กำลังออกจากระบบ..."), false);
  assert.equal(nodes(ui.render(true)).find((node) => node.type === "Button").props.disabled, false);
  retry = true;
  assert.equal(await ui.confirm(), true);
  assert.deepEqual(ui.redirects, ["/"]);
});

test("network errors restore the logout button and preserve the page for a retry", async (t) => {
  const ui = button(t, async () => { throw new Error("offline"); });
  assert.equal(await ui.confirm(), false);
  assert.equal(ui.errors.length, 1);
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.redirects.length, 0);
  assert.equal(nodes(ui.render()).find((node) => node.type === "Button").props.disabled, false);
});

test("signout rejects malformed or failed CSRF responses without posting a logout", async (t) => {
  const client = loadTypeScript("../lib/auth-client.ts");
  for (const data of [{}, null, { csrfToken: "" }, { csrfToken: 123 }]) {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url) => { requests.push(url); return Response.json(data); });
    await assert.rejects(client.signOutClient());
    assert.deepEqual(requests, ["/api/auth/csrf"]);
  }
});

test("signout does not report success when NextAuth returns HTTP 200 but retains an authenticated session", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    if (url.endsWith("csrf")) return Response.json({ csrfToken: "test-token" });
    if (url.endsWith("session")) return Response.json({ user: { id: "7" } });
    return new Response("CSRF error page", { status: 200, headers: { "Content-Type": "text/html" } });
  });
  const client = loadTypeScript("../lib/auth-client.ts");
  await assert.rejects(client.signOutClient(), { message: "Sign out did not clear the session" });
  assert.deepEqual(requests, ["/api/auth/csrf", "/api/auth/signout", "/api/auth/session"]);
});

test("signout rejects API failures and verification failures instead of navigating as though logout succeeded", async (t) => {
  const client = loadTypeScript("../lib/auth-client.ts");
  for (const failingPath of ["/api/auth/signout", "/api/auth/session"]) {
    t.mock.method(globalThis, "fetch", async (url) => url === failingPath ? Response.json({}, { status: 500 }) : Response.json(url.endsWith("csrf") ? { csrfToken: "test-token" } : {}));
    await assert.rejects(client.signOutClient());
  }
});
