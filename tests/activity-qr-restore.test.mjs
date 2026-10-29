import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { loadTypeScript } from "./load-typescript.mjs";
import { browser, reactHarness } from "./activity-live-harness.mjs";

const now = new Date("2026-10-29T03:00:00Z");
const cached = { id: "9", activityId: "4", purpose: "CHECK_IN", expiresAt: "2026-10-29T03:15:00.000Z",
  token: "original-token", scanUrl: "https://example.test/scan?token=original-token", qrDataUrl: "data:image/png;base64,original-image" };
const key = (id = "4") => `medexplore:activity-qr:${id}`;
const metadata = () => Response.json({ data: { id: cached.id, activityId: cached.activityId, purpose: cached.purpose, expiresAt: cached.expiresAt } });

function setup(t, fetchImpl = async () => metadata()) {
  t.mock.timers.enable({ apis: ["Date"], now });
  const mounted = [];
  t.after(() => mounted.forEach((hooks) => hooks.hide()));
  const page = browser(t, fetchImpl);
  const saved = new Map();
  page.pageWindow.sessionStorage = {
    getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key),
  };
  const mount = () => {
    const hooks = reactHarness();
    const { useActivityQr } = loadTypeScript("../components/use-activity-qr.ts", { react: hooks.react, "@/lib/activity-live": loadTypeScript("../lib/activity-live.ts") });
    mounted.push(hooks);
    return { render: (id = "4") => hooks.render(() => useActivityQr(id)), hide: () => hooks.hide() };
  };
  return { page, saved, mount };
}

test("refresh restores the exact original QR after server validation, without creating a new session or extending expiry", async (t) => {
  const calls = [];
  const { saved, mount } = setup(t, async (url, options) => { calls.push({ url, options }); return metadata(); });
  const first = mount();
  first.render().setQr(cached);
  assert.equal(first.render().qr.token, cached.token);
  assert.equal(saved.get(key()), JSON.stringify(cached));
  first.hide();
  t.mock.timers.setTime(now.getTime() + 60000);
  const refreshed = mount();
  assert.equal(refreshed.render().qr, null, "do not show cached QR before validating it");
  await setImmediate();
  const restored = refreshed.render();
  assert.deepEqual(restored.qr, cached);
  assert.equal(restored.remaining, 14 * 60);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/qr-sessions/9?activityId=4");
  assert.equal(calls[0].options.headers["X-QR-Token"], cached.token);
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.method, undefined);
});

test("returning to a preserved activity rechecks the cached QR and rejects a server-side revocation", async (t) => {
  let revoked = false;
  const { saved, mount } = setup(t, async () => revoked ? Response.json({ data: null }) : metadata());
  saved.set(key(), JSON.stringify(cached));
  const ui = mount(); ui.render(); await setImmediate();
  assert.ok(ui.render().qr);
  ui.hide();
  revoked = true;
  ui.render(); await setImmediate();
  assert.equal(ui.render().qr, null);
  assert.equal(saved.has(key()), false);
  assert.match(ui.render().notice, /หมดอายุหรือถูกปิด/);
});

test("expired and invalid saved QRs are discarded without a request; different activities stay isolated", async (t) => {
  let requests = 0;
  const { saved, mount } = setup(t, async () => { requests++; return metadata(); });
  saved.set(key(), JSON.stringify({ ...cached, expiresAt: now.toISOString() }));
  let ui = mount(); ui.render();
  assert.equal(ui.render().qr, null);
  assert.equal(saved.has(key()), false);
  saved.set(key(), "invalid JSON");
  ui = mount(); ui.render();
  assert.equal(saved.has(key()), false);
  saved.set(key(), JSON.stringify(cached));
  ui = mount(); ui.render("5");
  assert.equal(ui.render("5").qr, null);
  assert.equal(saved.has(key()), true);
  assert.equal(requests, 0);
});

test("failed validation preserves the saved QR for retry but keeps it hidden until validation succeeds", async (t) => {
  let fail = true;
  const { saved, mount } = setup(t, async () => { if (fail) throw new Error("Offline"); return metadata(); });
  saved.set(key(), JSON.stringify(cached));
  const ui = mount(); ui.render(); await setImmediate();
  assert.equal(ui.render().qr, null);
  assert.equal(ui.render().error, "Offline");
  assert.equal(saved.has(key()), true);
  fail = false;
  ui.render().retryRestore(); ui.render(); await setImmediate();
  assert.deepEqual(ui.render().qr, cached);
});

test("the countdown expires at the original deadline and closing clears the stored QR", async (t) => {
  const { saved, mount, page } = setup(t);
  let refreshes = 0;
  page.pageWindow.addEventListener("med-explore:activity-updated", () => { refreshes++; });
  const ui = mount(); ui.render().setQr(cached); ui.render();
  t.mock.timers.setTime(new Date(cached.expiresAt).getTime() - 1);
  await page.tick();
  assert.equal(ui.render().remaining, 1);
  assert.ok(ui.render().qr);
  assert.equal(refreshes, 0);
  t.mock.timers.setTime(new Date(cached.expiresAt).getTime());
  await page.tick();
  assert.equal(ui.render().qr, null);
  assert.equal(saved.has(key()), false);
  assert.equal(refreshes, 1, "expiry refreshes live stars immediately");
  await page.tick();
  assert.equal(refreshes, 1);
  ui.render().setQr({ ...cached, expiresAt: new Date(Date.now() + 60000).toISOString() });
  ui.render().setQr(null);
  assert.equal(saved.has(key()), false);
});

test("late restore responses cannot overwrite a newly created QR or another activity", async (t) => {
  let finish;
  let signal;
  const { saved, mount } = setup(t, (_url, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
  saved.set(key(), JSON.stringify(cached));
  const ui = mount(); ui.render();
  const next = { ...cached, id: "10", token: "new-token" };
  ui.render().setQr(next);
  finish(metadata()); await setImmediate();
  assert.equal(ui.render().qr.id, "10");
  ui.render("5");
  assert.equal(signal.aborted, true);
  assert.equal(ui.render("5").qr, null);
});
