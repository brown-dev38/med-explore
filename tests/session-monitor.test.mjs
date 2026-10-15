import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";

const notices = loadTypeScript("../lib/session-notices.ts");
const { monitorSession, SESSION_CHECK_INTERVAL_MS } = loadTypeScript("../lib/session-monitor.ts", { "@/lib/session-notices": notices });

function browser(t, fetchImpl) {
  const pageWindow = new EventTarget();
  const pageDocument = new EventTarget();
  pageDocument.visibilityState = "visible";
  const intervals = new Map();
  const timeouts = new Map();
  let id = 0;
  pageWindow.setInterval = (fn, ms) => { assert.equal(ms, SESSION_CHECK_INTERVAL_MS); intervals.set(++id, fn); return id; };
  pageWindow.clearInterval = (key) => intervals.delete(key);
  pageWindow.setTimeout = (fn) => { timeouts.set(++id, fn); return id; };
  pageWindow.clearTimeout = (key) => timeouts.delete(key);
  for (const [name, value] of [["window", pageWindow], ["document", pageDocument]]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  t.mock.method(globalThis, "fetch", fetchImpl);
  return { pageWindow, pageDocument, intervals, timeouts, tick: async () => { for (const fn of intervals.values()) fn(); await setImmediate(); } };
}

test("an open page detects suspension on its next poll without a reload and reports it once", async (t) => {
  let session = { user: { id: "2" }, accountStatus: "ACTIVE" };
  let requests = 0;
  const page = browser(t, async (url, options) => {
    requests++;
    assert.equal(url, "/api/auth/session");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "include");
    return Response.json(session);
  });
  const reasons = [];
  const stop = monitorSession((reason) => { reasons.push(reason); });
  await setImmediate();
  assert.equal(SESSION_CHECK_INTERVAL_MS, 5000);
  assert.deepEqual(reasons, []);
  session = { user: { id: "" }, accountStatus: "SUSPENDED" };
  await page.tick();
  assert.deepEqual(reasons, ["account-suspended"]);
  await page.tick();
  page.pageWindow.dispatchEvent(new Event("focus"));
  assert.equal(requests, 2);
  stop();
  assert.equal(page.intervals.size, 0);
  assert.equal(page.timeouts.size, 0);
});

test("returning to a hidden tab or reconnecting triggers a check immediately", async (t) => {
  let session = { user: { id: "2" }, accountStatus: "ACTIVE" };
  let requests = 0;
  const page = browser(t, async () => { requests++; return Response.json(session); });
  page.pageDocument.visibilityState = "hidden";
  const reasons = [];
  const stop = monitorSession((reason) => { reasons.push(reason); });
  await page.tick();
  assert.equal(requests, 0);
  page.pageDocument.visibilityState = "visible";
  page.pageDocument.dispatchEvent(new Event("visibilitychange"));
  await setImmediate();
  assert.equal(requests, 1);
  session = { user: { id: "" }, accountStatus: "DELETED" };
  page.pageWindow.dispatchEvent(new Event("online"));
  await setImmediate();
  assert.deepEqual(reasons, ["account-deleted"]);
  stop();
});

test("network and server failures do not suspend an active session", async (t) => {
  let failure = "network";
  const page = browser(t, async () => {
    if (failure === "network") throw new Error("Offline");
    if (failure === "server") return new Response("Unavailable", { status: 503 });
    if (failure === "invalid-json") return new Response("invalid-json");
    return Response.json({ user: { id: "2" }, accountStatus: "ACTIVE" });
  });
  const reasons = [];
  const stop = monitorSession((reason) => { reasons.push(reason); });
  await setImmediate();
  for (failure of ["server", "invalid-json", "none"]) await page.tick();
  assert.deepEqual(reasons, []);
  stop();
});

test("checks never overlap and a late response after unmount cannot log a user out", async (t) => {
  let resolve;
  let requests = 0;
  let signal;
  const page = browser(t, async (_url, options) => {
    requests++;
    signal = options.signal;
    return new Promise((done) => { resolve = done; });
  });
  const reasons = [];
  const stop = monitorSession((reason) => { reasons.push(reason); });
  page.pageWindow.dispatchEvent(new Event("focus"));
  await page.tick();
  assert.equal(requests, 1);
  stop();
  assert.equal(signal.aborted, true);
  resolve(Response.json({ accountStatus: "SUSPENDED" }));
  await setImmediate();
  page.pageWindow.dispatchEvent(new Event("focus"));
  page.pageDocument.dispatchEvent(new Event("visibilitychange"));
  assert.equal(requests, 1);
  assert.deepEqual(reasons, []);
  assert.equal(page.timeouts.size, 0);
});

test("an expired session produces its own notice and unknown reason parameters are ignored", async (t) => {
  browser(t, async () => Response.json({}));
  const reasons = [];
  const stop = monitorSession((reason) => { reasons.push(reason); });
  await setImmediate();
  assert.deepEqual(reasons, ["session-expired"]);
  assert.equal(notices.getSessionNotice("account-suspended").title, "บัญชีของคุณถูกระงับ");
  assert.equal(notices.getSessionNotice("__proto__"), null);
  assert.equal(notices.getSessionNotice("unknown"), null);
  assert.equal(notices.sessionLoginPath("account-suspended"), "/login?reason=account-suspended");
  stop();
});
